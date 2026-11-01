import {
  createServer as httpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo, Socket } from "node:net";
import {
  API_VERSION,
  APP_ID,
  DEFAULT_VOICE,
  FRAMES_CONTENT_TYPE,
  SAMPLE_RATE,
  encodeFrame,
  type EngineId,
  type ErrorCode,
  type FrameHeader,
  type Health,
  type VoiceList,
} from "@speakkit/protocol";
import {
  EngineNotReadyError,
  EngineUnavailableError,
  WavError,
  analyzeClip,
  normalizeText,
  parseWav,
  type SynthOptions,
  type Synthesized,
  type TtsEngine,
} from "@speakkit/engine";
import {
  DEFAULT_MAX_QUEUE,
  DEFAULT_MAX_STREAMS,
  MAX_CLIP_BODY,
  RequestError,
  parseClone,
  parseEngineId,
  parseEnv,
  parseExport,
  parseHold,
  parseOptions,
  parseReplace,
  parseSpeak,
  speakSchema,
} from "./config";
import { EngineRegistry, UnknownEngineError } from "./engines";
import { ExportFullError, ExportManager } from "./export";

export interface ServerOptions {
  /** The default engine (Kokoro, or the fake engine in tests). */
  engine: TtsEngine;
  /** Optional second engine; only one of the two is ever loaded. See ChatterboxEngine. */
  chatterbox?: TtsEngine;
  dataDir: string;
  /** 0 picks a free port (tests). Default 47615. */
  port?: number;
  host?: string;
  version?: string;
  /** Overrides env SPEAKKIT_TOKEN and the persisted token file. */
  token?: string;
  /** Idle window in ms before the model is unloaded; 0 never. Overrides env SPEAKKIT_IDLE_MS and the engine's own setting. */
  idleUnloadMs?: number;
  /** Load the model right after listening instead of on first use. Env SPEAKKIT_LOAD_AT_START. Default false. */
  loadAtStart?: boolean;
  /** Streams synthesizing at once (env SPEAKKIT_MAX_STREAMS). Default 2. */
  maxStreams?: number;
  /** Streams waiting FIFO for a slot before new ones get HTTP 429 (env SPEAKKIT_MAX_QUEUE). Default 8. */
  maxQueue?: number;
}

export interface SpeakKitServer {
  listen(): Promise<void>;
  /** Stops listening, aborts active streams and drops connections. Does not close the engine. */
  close(): Promise<void>;
  /** Actual port once listening. */
  readonly port: number;
  readonly token: string;
  /** Runtime settings the desktop app changes; they forward to the engines. 0 = never unload. */
  setIdleUnloadMs(ms: number): void;
  setOnBattery(onBattery: boolean): void;
}

const MAX_BODY = 2 * 1024 * 1024;
const REPLACED = new Error("replaced by a newer request");

export function loadToken(dataDir: string, override?: string): string {
  const given = override ?? parseEnv().SPEAKKIT_TOKEN;
  if (given) return given;
  const file = join(dataDir, "token");
  if (existsSync(file)) {
    const t = readFileSync(file, "utf8").trim();
    if (t) return t;
  }
  const t = randomBytes(32).toString("hex");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, t + "\n", { mode: 0o600 });
  return t;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

class HttpError extends Error {
  status: number;
  code: ErrorCode | "method-not-allowed" | "internal";
  /** Extra fields of the error body (clip checks). */
  extra?: object;
  constructor(status: number, code: HttpError["code"], message: string, extra?: object) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function toHttp(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof EngineUnavailableError) return new HttpError(409, "engine-unavailable", e.message);
  if (e instanceof UnknownEngineError) return new HttpError(404, "not-found", e.message);
  if (e instanceof ExportFullError) return new HttpError(429, "busy", e.message);
  return new HttpError(500, "internal", "internal error");
}

async function readBody(req: IncomingMessage, max = MAX_BODY): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    n += c.length;
    if (n > max) throw new HttpError(413, "invalid-request", "body too large");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid-request", "body is not valid JSON");
  }
}

/** Runs `fn` on a validation failure as a 400 invalid-request. */
function validated<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RequestError) throw new HttpError(400, "invalid-request", e.message);
    throw e;
  }
}

interface Stream {
  ac: AbortController;
  /** Stream group from `X-SpeakKit-Replace: <id>`; undefined for requests that sent no id. */
  group?: string;
  /** Removes this stream from the wait queue, if it is queued. */
  dequeue?: () => void;
}

const UNUSABLE = new Set(["missing", "unavailable", "installing"]);

export function createServer(opts: ServerOptions): SpeakKitServer {
  const { engine: kokoro, dataDir, host = "127.0.0.1", version = "0.0.0" } = opts;
  const env = parseEnv();
  const plain = parseOptions({
    port: opts.port,
    idleUnloadMs: opts.idleUnloadMs,
    maxStreams: opts.maxStreams,
    maxQueue: opts.maxQueue,
    token: opts.token,
    loadAtStart: opts.loadAtStart,
  });
  const maxStreams = plain.maxStreams ?? env.SPEAKKIT_MAX_STREAMS ?? DEFAULT_MAX_STREAMS;
  const maxQueue = plain.maxQueue ?? env.SPEAKKIT_MAX_QUEUE ?? DEFAULT_MAX_QUEUE;
  const loadAtStart = plain.loadAtStart ?? env.SPEAKKIT_LOAD_AT_START ?? false;
  const idle = plain.idleUnloadMs ?? env.SPEAKKIT_IDLE_MS;

  const streams = new Set<Stream>(); // running and queued
  const waiters: { go: () => void; reject: (e: unknown) => void }[] = [];
  let running = 0;
  const sockets = new Set<Socket>();
  let boundPort = plain.port ?? 47615;

  const exporter = new ExportManager(join(dataDir, "exports"), {
    acquireSlot: async (ac) => {
      const s: Stream = { ac };
      ac.signal.addEventListener("abort", () => s.dequeue?.(), { once: true });
      await acquire(s);
      return release;
    },
    render: (e, sentence, o) => render(e, sentence, o),
  });
  const engines = new EngineRegistry(
    { kokoro, ...(opts.chatterbox && { chatterbox: opts.chatterbox }) },
    dataDir,
    () => {
      for (const s of streams) s.ac.abort(REPLACED);
      exporter.abortAll();
    },
  );
  if (idle !== undefined) for (const e of engines.all()) e.setIdleUnloadMs?.(idle);

  const token = loadToken(dataDir, plain.token);
  const tokenHash = sha(token);
  const voiceIds = () => new Set(engines.active.voices().map((v) => v.id));

  const server: Server = httpServer((req, res) => {
    handle(req, res).catch((e) => {
      if (res.headersSent) return void res.destroy();
      const h = toHttp(e);
      json(res, h.status, { error: { code: h.code, message: h.message, ...h.extra } });
    });
  });
  server.on("connection", (s) => {
    s.setNoDelay(true);
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });

  function json(res: ServerResponse, status: number, body: unknown): void {
    const data = Buffer.from(JSON.stringify(body));
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": data.length,
      "Cache-Control": "no-store",
    });
    res.end(data);
  }
  const noContent = (res: ServerResponse) => {
    res.writeHead(204);
    res.end();
  };

  const authorized = (req: IncomingMessage): boolean => {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    return !!m && timingSafeEqual(sha(m[1]!), tokenHash);
  };

  /** Normalizes a sentence for the engine and synthesizes it; a sentence that is only emoji or symbols becomes 100 ms of silence. */
  async function render(engine: TtsEngine, sentence: string, o: SynthOptions): Promise<Synthesized> {
    const text = normalizeText(sentence, { numbers: engine.needsNumberWords });
    if (!text) return { pcm: new Int16Array(SAMPLE_RATE / 10), sampleRate: SAMPLE_RATE };
    return engine.synthesize(text, o);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const hostHeader = req.headers.host;
    if (hostHeader !== `127.0.0.1:${boundPort}` && hostHeader !== `localhost:${boundPort}`)
      throw new HttpError(403, "forbidden", "bad Host header");
    const origin = req.headers.origin;
    if (origin !== undefined && !origin.startsWith("chrome-extension://"))
      throw new HttpError(403, "forbidden", "origin not allowed");
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    const url = new URL(req.url ?? "/", "http://x");
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "OPTIONS") {
      if (!origin) throw new HttpError(403, "forbidden", "preflight needs an extension origin");
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-SpeakKit-Replace",
        "Access-Control-Max-Age": "600",
      });
      return void res.end();
    }

    const allow = (m: string) => {
      if (method !== m) {
        res.setHeader("Allow", m);
        throw new HttpError(405, "method-not-allowed", `use ${m}`);
      }
    };
    const needAuth = () => {
      if (!authorized(req)) throw new HttpError(401, "token-rejected", "missing or wrong token");
    };

    switch (path) {
      case "/v1/health": {
        allow("GET");
        const engine = engines.active;
        const s = engine.status();
        const unloadAt = s.state === "ready" ? engine.idleUnloadAtMs?.() : undefined;
        const health: Health = {
          app: APP_ID,
          version,
          apiVersion: API_VERSION,
          engine: {
            id: engines.activeId,
            state: s.state,
            ...(s.progress !== undefined && { progress: s.progress }),
            ...(s.detail && { detail: s.detail }),
            ...(unloadAt !== undefined && { idleUnloadAtMs: unloadAt }),
          },
        };
        return json(res, 200, health);
      }
      case "/v1/auth/check":
        allow("GET");
        needAuth();
        return noContent(res);
      case "/v1/voices": {
        allow("GET");
        needAuth();
        const voices = engines.active.voices();
        const list: VoiceList = {
          voices,
          default: voices.some((v) => v.id === DEFAULT_VOICE) ? DEFAULT_VOICE : voices[0]!.id,
        };
        return json(res, 200, list);
      }
      case "/v1/speak": {
        allow("POST");
        needAuth();
        const replace = validated(() => parseReplace(req.headers["x-speakkit-replace"]));
        const body = await readBody(req);
        return speak(req, res, validated(() => parseSpeak(speakSchema(voiceIds()), body)), replace);
      }
      case "/v1/engine/warm": {
        allow("POST");
        needAuth();
        req.resume();
        const engine = engines.active;
        if (engine.warm) engine.warm();
        else if (engine.status().state === "unloaded") engine.start().catch(() => {});
        return json(res, 202, { state: engine.status().state });
      }
      case "/v1/engine/hold": {
        allow("POST");
        needAuth();
        const raw = await readBody(req);
        const { ms } = validated(() => parseHold(raw));
        engines.active.hold?.(ms);
        return noContent(res);
      }
      case "/v1/engines":
        allow("GET");
        needAuth();
        return json(res, 200, engines.list());
      case "/v1/engines/select": {
        allow("POST");
        needAuth();
        const raw = await readBody(req);
        await engines.select(validated(() => parseEngineId(raw)));
        return json(res, 200, engines.list());
      }
      case "/v1/voices/clone": {
        allow("POST");
        needAuth();
        const raw = await readBody(req, MAX_CLIP_BODY);
        return json(res, 201, cloneVoice(validated(() => parseClone(raw))));
      }
      case "/v1/voices/cloned":
        allow("GET");
        needAuth();
        return json(res, 200, { voices: engines.cloner()?.clones?.list() ?? [] });
      case "/v1/export": {
        allow("POST");
        needAuth();
        const raw = await readBody(req);
        const input = validated(() => parseExport(voiceIds(), raw));
        return json(res, 202, exporter.create(engines.active, input));
      }
      default:
        return routeById(req, res, path, method, needAuth);
    }
  }

  /** Routes with an id in the path: engines, cloned voices, export jobs. */
  async function routeById(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    method: string,
    needAuth: () => void,
  ): Promise<void> {
    const need = (m: string) => {
      if (method !== m) {
        res.setHeader("Allow", m);
        throw new HttpError(405, "method-not-allowed", `use ${m}`);
      }
      needAuth();
    };
    let m: RegExpExecArray | null;
    if ((m = /^\/v1\/engines\/(kokoro|chatterbox)\/install$/.exec(path))) {
      need("POST");
      req.resume();
      const id = m[1] as EngineId;
      const engine = engines.get(id);
      const st = engine.status();
      if (st.state === "unavailable") throw new EngineUnavailableError(st.detail ?? `${id} cannot run here`, engine.info?.().reason);
      if (engine.install) engine.install().catch(() => {}); // failure shows as state "missing" with a detail
      else if (st.state === "missing") engine.start().catch(() => {});
      return json(res, 202, engines.list());
    }
    if ((m = /^\/v1\/engines\/(kokoro|chatterbox)$/.exec(path))) {
      need("DELETE");
      const id = m[1] as EngineId;
      if (!engines.get(id).remove) throw new HttpError(400, "invalid-request", `${id} cannot be removed`);
      await engines.remove(id);
      return json(res, 200, engines.list());
    }
    if ((m = /^\/v1\/voices\/(cb_[0-9a-f]{8})$/.exec(path))) {
      need("DELETE");
      if (!engines.cloner()?.clones?.remove(m[1]!)) throw new HttpError(404, "not-found", "no such cloned voice");
      return noContent(res);
    }
    if ((m = /^\/v1\/export\/([0-9a-f]{16})(\/audio)?$/.exec(path))) {
      const job = exporter.get(m[1]!);
      if (method === "DELETE" && !m[2]) {
        need("DELETE");
        await exporter.cancel(m[1]!);
        return noContent(res);
      }
      need("GET");
      if (!job) throw new HttpError(404, "not-found", "no such export");
      if (!m[2]) return json(res, 200, exporter.view(job));
      if (job.state !== "done") throw new HttpError(409, "busy", `export is ${job.state}`);
      const { stream, length } = exporter.audio(job);
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": length, "Cache-Control": "no-store" });
      res.on("close", () => stream.destroy());
      return void stream.pipe(res);
    }
    throw new HttpError(404, "not-found", "no such endpoint");
  }

  function cloneVoice(body: ReturnType<typeof parseClone>) {
    const cloner = engines.cloner();
    const st = cloner?.status();
    if (!cloner?.clones || !st || UNUSABLE.has(st.state))
      throw new EngineUnavailableError("Install Chatterbox to clone voices", cloner?.info?.().reason ?? "not-installed");
    const bytes = Buffer.from(body.audio, "base64");
    let report;
    try {
      report = analyzeClip(parseWav(bytes));
    } catch (e) {
      if (e instanceof WavError) throw new HttpError(422, "clip-rejected", e.message);
      throw e;
    }
    if (!report.ok)
      throw new HttpError(422, "clip-rejected", report.checks.find((c) => !c.ok)!.message, { checks: report.checks });
    return cloner.clones.add({ name: body.name, wav: bytes, durationMs: report.durationMs, checks: report.checks, gender: body.gender });
  }

  function acquire(s: Stream): Promise<void> {
    if (running < maxStreams) {
      running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const w = {
        go: () => (running++, resolve()),
        reject,
      };
      waiters.push(w);
      s.dequeue = () => {
        const i = waiters.indexOf(w);
        if (i >= 0) {
          waiters.splice(i, 1);
          reject(s.ac.signal.reason);
        }
      };
    });
  }
  function release(): void {
    running--;
    waiters.shift()?.go();
  }

  async function speak(
    req: IncomingMessage,
    res: ServerResponse,
    body: ReturnType<typeof parseSpeak>,
    replace: ReturnType<typeof parseReplace>,
  ): Promise<void> {
    if (replace) {
      // "1" replaces every earlier stream of the token; an id only the streams sent with the same id (one per tab).
      for (const old of streams)
        if ("all" in replace || old.group === replace.group) {
          old.ac.abort(REPLACED);
          old.dequeue?.();
        }
    } else if (running >= maxStreams && waiters.length >= maxQueue) {
      res.setHeader("Retry-After", "1");
      throw new HttpError(429, "busy", `at most ${maxStreams} streams and ${maxQueue} queued`);
    }
    const stream: Stream = { ac: new AbortController(), group: replace && "group" in replace ? replace.group : undefined };
    const ac = stream.ac;
    streams.add(stream);
    res.on("close", () => {
      streams.delete(stream);
      if (!res.writableFinished) ac.abort();
      stream.dequeue?.();
    });
    const head = () => {
      res.writeHead(200, {
        "Content-Type": FRAMES_CONTENT_TYPE,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.flushHeaders();
    };
    const engine = engines.active;
    engine.warm?.(); // start loading while we may still be queued

    try {
      await acquire(stream);
    } catch {
      // Replaced or disconnected while queued: end the stream without frames.
      if (!res.destroyed && !res.headersSent) head();
      return void res.end();
    }
    const endStream = engine.beginStream?.();
    head();

    const send = async (h: FrameHeader, pcm?: Int16Array) => {
      if (res.destroyed) return;
      // One write per frame; node flushes it to the socket immediately (TCP_NODELAY is set).
      if (!res.write(encodeFrame(h, pcm)))
        await new Promise<void>((r) => {
          const done = () => (res.off("drain", done), res.off("close", done), r());
          res.on("drain", done);
          res.on("close", done);
        });
    };
    try {
      const speed = Math.min(body.speed, 2);
      for (let i = 0; i < body.sentences.length; i++) {
        const { pcm, sampleRate } = await render(engine, body.sentences[i]!, {
          voice: body.voice,
          speed,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        await send(
          {
            type: "audio",
            index: i,
            sampleRate,
            samples: pcm.length,
            durationMs: Math.round((pcm.length / sampleRate) * 1000),
          },
          pcm,
        );
      }
      await send({ type: "done", count: body.sentences.length });
    } catch (e) {
      if (ac.signal.aborted) return;
      const notReady = e instanceof EngineNotReadyError;
      await send({
        type: "error",
        code: notReady ? "engine-not-ready" : "synthesis-failed",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      endStream?.();
      release();
      if (!res.writableEnded) res.end(); // replaced streams end here, without a done frame
    }
  }

  return {
    get port() {
      return boundPort;
    },
    token,
    setIdleUnloadMs: (ms) => engines.all().forEach((e) => e.setIdleUnloadMs?.(ms)),
    setOnBattery: (b) => engines.all().forEach((e) => e.setOnBattery?.(b)),
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(boundPort, host, () => {
          server.off("error", reject);
          boundPort = (server.address() as AddressInfo).port;
          if (loadAtStart) engines.active.start().catch(() => {});
          resolve();
        });
      }),
    close: async () => {
      for (const s of streams) s.ac.abort();
      await exporter.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const s of sockets) s.destroy();
      });
    },
  };
}
