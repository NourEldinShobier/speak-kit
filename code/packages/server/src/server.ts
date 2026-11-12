import { createServer as httpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo, Socket } from "node:net";
import type { TtsEngine } from "@speakkit/engine";
import { AUTOMATION_LIMITS } from "@speakkit/protocol";
import { DEFAULT_CONTROL_DEADLINE_MS, DEFAULT_MAX_QUEUE, DEFAULT_MAX_STREAMS, DEFAULT_STREAM_IDLE_MS, parseEnv, parseOptions } from "./config";
import type { AutomationHost } from "./automation";
import { EngineRegistry } from "./engines";
import { ExportManager } from "./export";
import { removeLeftovers } from "./leftovers";
import { HttpError, guardRequest, json, preflight, toHttp, tokenChecker, withDeadline, type GuardOptions } from "./http";
import { render } from "./render";
import { resolveRoute, type Route, type Services } from "./router";
import { automationRoutes } from "./routes/automation";
import { PageContext } from "./page-context";
import { pageContextRoutes } from "./routes/page-context";
import { streamRoutes } from "./routes/streams";
import { StreamSessions, type StreamsHost } from "./streams/sessions";
import { engineRoutes } from "./routes/engines";
import { exportRoutes } from "./routes/export";
import { speakRoutes } from "./routes/speak";
import { statusRoutes } from "./routes/status";
import { StreamQueue } from "./stream-queue";
import { LOOKS_PER_WINDOW, MintLimiter, type VoiceChatService } from "./voice-chat";
import { voiceChatRoutes } from "./routes/voice-chat";

export interface ServerOptions {
  /** The engine (Kokoro, or the fake engine in tests). */
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
  /** Control routes answer within this many ms or fail with 504. Default 8000. */
  controlDeadlineMs?: number;
  /** A speak stream that produces no frame for this many ms ends with a synthesis-failed frame. Default 30000. */
  streamIdleMs?: number;
  /** Only these extension ids may call (the part after chrome-extension://). Default: any extension that has the token. */
  allowedExtensions?: string[];
  /** Called with an error the node server raises after it started listening (for example EMFILE on accept). Default: one line on stderr. */
  onError?: (e: Error) => void;
  /** Voice chat (the OpenAI key and the minting of Realtime client secrets) lives in the host app. Without it the voice chat routes answer "unavailable". */
  voiceChat?: VoiceChatService;
  /** The reader, queue and exports for scripts and AI apps. Without it the automation routes answer "unsupported". */
  automation?: AutomationHost;
  /** The speech engine and the dictation rules for live transcription of other apps. Without it the stream routes answer "unsupported". */
  streams?: StreamsHost;
  /** Heartbeat of the event stream in ms. Default 15000. */
  heartbeatMs?: number;
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

/** Startup only: runs before the server listens, so the synchronous file calls cannot delay a request. */
export function loadToken(dataDir: string, override?: string): string {
  const given = override ?? parseEnv().SPEAKKIT_TOKEN;
  if (given) return given;
  const file = join(dataDir, "token");
  // oxlint-disable-next-line node/no-sync -- startup
  if (existsSync(file)) {
    // oxlint-disable-next-line node/no-sync -- startup
    const t = readFileSync(file, "utf8").trim();
    if (t) return t;
  }
  const t = randomBytes(32).toString("hex");
  // oxlint-disable-next-line node/no-sync -- startup
  mkdirSync(dataDir, { recursive: true });
  // oxlint-disable-next-line node/no-sync -- startup
  writeFileSync(file, t + "\n", { mode: 0o600 });
  return t;
}

const ROUTES: readonly Route[] = [...statusRoutes, ...speakRoutes, ...engineRoutes, ...exportRoutes, ...voiceChatRoutes, ...automationRoutes, ...streamRoutes, ...pageContextRoutes];

type PlainOptions = ReturnType<typeof parseOptions>;
type Env = ReturnType<typeof parseEnv>;

/** The engines, the stream queue and the exporter, with the limits from options, then env, then defaults. */
function createServices(opts: ServerOptions, plain: PlainOptions, env: Env): Services {
  const queue = new StreamQueue(plain.maxStreams ?? env.SPEAKKIT_MAX_STREAMS ?? DEFAULT_MAX_STREAMS, plain.maxQueue ?? env.SPEAKKIT_MAX_QUEUE ?? DEFAULT_MAX_QUEUE);
  const exporter = new ExportManager(join(opts.dataDir, "exports"), { acquireSlot: (ac) => queue.slot(ac), render });
  const engines = new EngineRegistry(opts.engine);
  const idle = plain.idleUnloadMs ?? env.SPEAKKIT_IDLE_MS;
  if (idle !== undefined) for (const e of engines.all()) e.setIdleUnloadMs?.(idle);
  const deadlines = { controlMs: plain.controlDeadlineMs ?? DEFAULT_CONTROL_DEADLINE_MS, streamIdleMs: plain.streamIdleMs ?? DEFAULT_STREAM_IDLE_MS };
  return {
    engines,
    exporter,
    queue,
    version: opts.version ?? "0.0.0",
    voiceChat: opts.voiceChat,
    automation: opts.automation,
    pageContext: new PageContext(Date.now),
    streams: opts.streams && new StreamSessions(opts.streams, { now: Date.now }),
    events: { open: 0 },
    heartbeatMs: opts.heartbeatMs ?? AUTOMATION_LIMITS.heartbeatMs,
    mintLimiter: new MintLimiter(),
    lookLimiter: new MintLimiter(LOOKS_PER_WINDOW),
    deadlines,
  };
}

/** Guard, route, authorize, then run the handler; control routes under their deadline, the speak stream under none. */
function requestHandler(services: Services, authorized: (req: IncomingMessage) => boolean, guard: GuardOptions) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const origin = guardRequest(req, res, guard);
    const method = req.method ?? "GET";
    if (method === "OPTIONS") return preflight(res, origin);
    const { route, params } = resolveRoute(ROUTES, method, new URL(req.url ?? "/", "http://x").pathname);
    if (route.auth !== false && !authorized(req)) throw new HttpError(401, "token-rejected", "missing or wrong token");
    const ac = new AbortController();
    const done = route.handle({ req, res, params, signal: ac.signal }, services);
    await (route.stream ? done : withDeadline(done, services.deadlines.controlMs, ac));
  };
}

function sendError(res: ServerResponse, e: unknown): void {
  if (res.headersSent) return void res.destroy();
  const h = toHttp(e);
  for (const [k, v] of Object.entries(h.headers ?? {})) res.setHeader(k, v);
  json(res, h.status, { error: { code: h.code, message: h.message } });
}

/** The node server for `handle`; every connection is kept in `sockets` so close() can drop it. */
function httpServerTracking(handle: ReturnType<typeof requestHandler>, sockets: Set<Socket>): Server {
  const server = httpServer((req, res) => {
    handle(req, res).catch((e) => sendError(res, e));
  });
  server.on("connection", (s) => {
    s.setNoDelay(true);
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  return server;
}

/** Listens and resolves with the bound port; an error before that rejects, one after it goes to `onError` (unhandled, it would be an uncaught exception). */
function listenOn(server: Server, at: { port: number; host: string }, onError: (e: Error) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(at.port, at.host, () => {
      server.off("error", reject);
      server.on("error", onError);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/** Wires the pieces: the guard (Host, Origin, token), the route table, the stream queue and the engines. */
export function createServer(opts: ServerOptions): SpeakKitServer {
  const { dataDir, host = "127.0.0.1" } = opts;
  const env = parseEnv();
  const plain = parseOptions({
    port: opts.port,
    idleUnloadMs: opts.idleUnloadMs,
    maxStreams: opts.maxStreams,
    maxQueue: opts.maxQueue,
    controlDeadlineMs: opts.controlDeadlineMs,
    streamIdleMs: opts.streamIdleMs,
    token: opts.token,
    loadAtStart: opts.loadAtStart,
  });
  const loadAtStart = plain.loadAtStart ?? env.SPEAKKIT_LOAD_AT_START ?? false;
  let boundPort = plain.port ?? 47615;
  const sockets = new Set<Socket>();

  const services = createServices(opts, plain, env);
  const { engines, exporter, queue } = services;
  const token = loadToken(dataDir, plain.token);
  const allowedExtensions = opts.allowedExtensions ?? env.SPEAKKIT_EXTENSION_IDS;
  const handle = requestHandler(services, tokenChecker(token), { port: () => boundPort, ...(allowedExtensions && { allowedExtensions }) });

  const server = httpServerTracking(handle, sockets);
  const onError =
    opts.onError ??
    ((e: Error) =>
      void process.stderr.write(`speakkit server error: ${e.message}
`));

  return {
    get port() {
      return boundPort;
    },
    token,
    setIdleUnloadMs: (ms) => engines.all().forEach((e) => e.setIdleUnloadMs?.(ms)),
    setOnBattery: (b) => engines.all().forEach((e) => e.setOnBattery?.(b)),
    listen: async () => {
      boundPort = await listenOn(server, { port: boundPort, host }, onError);
      void removeLeftovers(dataDir); // multi-GB folders: not awaited, and a failure is not the server's
      if (loadAtStart) engines.active.start().catch(() => {}); // failure shows in the engine status
    },
    close: async () => {
      services.streams?.dispose();
      queue.abortAll();
      await exporter.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const s of sockets) s.destroy();
      });
    },
  };
}
