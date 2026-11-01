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
  encodeFrame,
  type ErrorCode,
  type FrameHeader,
  type Health,
  type VoiceList,
} from "@speakkit/protocol";
import { EngineNotReadyError, type TtsEngine } from "@speakkit/engine";
import {
  DEFAULT_MAX_QUEUE,
  DEFAULT_MAX_STREAMS,
  RequestError,
  parseEnv,
  parseHold,
  parseOptions,
  parseSpeak,
  speakSchema,
} from "./config";

export interface ServerOptions {
  engine: TtsEngine;
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
  /** Runtime settings the desktop app changes; they forward to the engine. 0 = never unload. */
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
  code: ErrorCode | "not-found" | "method-not-allowed" | "internal";
  constructor(status: number, code: HttpError["code"], message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    n += c.length;
    if (n > MAX_BODY) throw new HttpError(413, "invalid-request", "body too large");
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
  /** Removes this stream from the wait queue, if it is queued. */
  dequeue?: () => void;
}

export function createServer(opts: ServerOptions): SpeakKitServer {
  const { engine, dataDir, host = "127.0.0.1", version = "0.0.0" } = opts;
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
  if (idle !== undefined) engine.setIdleUnloadMs?.(idle);

  const token = loadToken(dataDir, plain.token);
  const tokenHash = sha(token);
  const voiceIds = new Set(engine.voices().map((v) => v.id));
  const speakValidator = speakSchema(voiceIds);
  const streams = new Set<Stream>(); // running and queued
  const waiters: { go: () => void; reject: (e: unknown) => void }[] = [];
  let running = 0;
  const sockets = new Set<Socket>();
  let boundPort = plain.port ?? 47615;

  const server: Server = httpServer((req, res) => {
    handle(req, res).catch((e) => {
      if (res.headersSent) return void res.destroy();
      const h = e instanceof HttpError ? e : new HttpError(500, "internal", "internal error");
      json(res, h.status, { error: { code: h.code, message: h.message } });
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

  const authorized = (req: IncomingMessage): boolean => {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    return !!m && timingSafeEqual(sha(m[1]!), tokenHash);
  };

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
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
        const s = engine.status();
        const unloadAt = s.state === "ready" ? engine.idleUnloadAtMs?.() : undefined;
        const health: Health = {
          app: APP_ID,
          version,
          apiVersion: API_VERSION,
          engine: {
            id: "kokoro",
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
        res.writeHead(204);
        return void res.end();
      case "/v1/voices": {
        allow("GET");
        needAuth();
        const list: VoiceList = { voices: engine.voices(), default: DEFAULT_VOICE };
        return json(res, 200, list);
      }
      case "/v1/speak":
        allow("POST");
        needAuth();
        {
          const body = await readBody(req);
          return speak(
            req,
            res,
            validated(() => parseSpeak(speakValidator, body)),
          );
        }
      case "/v1/engine/warm":
        allow("POST");
        needAuth();
        req.resume();
        if (engine.warm) engine.warm();
        else if (engine.status().state === "unloaded") engine.start().catch(() => {});
        return json(res, 202, { state: engine.status().state });
      case "/v1/engine/hold": {
        allow("POST");
        needAuth();
        const raw = await readBody(req);
        const { ms } = validated(() => parseHold(raw));
        engine.hold?.(ms);
        res.writeHead(204);
        return void res.end();
      }
      default:
        throw new HttpError(404, "not-found", "no such endpoint");
    }
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
  ): Promise<void> {
    const replace = req.headers["x-speakkit-replace"] === "1";
    if (replace) {
      for (const old of streams) {
        old.ac.abort(REPLACED);
        old.dequeue?.();
      }
    } else if (running >= maxStreams && waiters.length >= maxQueue) {
      res.setHeader("Retry-After", "1");
      throw new HttpError(429, "busy", `at most ${maxStreams} streams and ${maxQueue} queued`);
    }
    const stream: Stream = { ac: new AbortController() };
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
        const { pcm, sampleRate } = await engine.synthesize(body.sentences[i]!, {
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
    setIdleUnloadMs: (ms) => engine.setIdleUnloadMs?.(ms),
    setOnBattery: (b) => engine.setOnBattery?.(b),
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(boundPort, host, () => {
          server.off("error", reject);
          boundPort = (server.address() as AddressInfo).port;
          if (loadAtStart) engine.start().catch(() => {});
          resolve();
        });
      }),
    close: () =>
      new Promise((resolve) => {
        for (const s of streams) s.ac.abort();
        server.close(() => resolve());
        for (const s of sockets) s.destroy();
      }),
  };
}
