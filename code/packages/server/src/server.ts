import { createServer as httpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo, Socket } from "node:net";
import type { TtsEngine } from "@speakkit/engine";
import { DEFAULT_MAX_QUEUE, DEFAULT_MAX_STREAMS, parseEnv, parseOptions } from "./config";
import { EngineRegistry } from "./engines";
import { ExportManager } from "./export";
import { HttpError, guardRequest, json, preflight, toHttp, tokenChecker } from "./http";
import { render } from "./render";
import { resolveRoute, type Route, type Services } from "./router";
import { engineRoutes } from "./routes/engines";
import { exportRoutes } from "./routes/export";
import { speakRoutes } from "./routes/speak";
import { statusRoutes } from "./routes/status";
import { voiceRoutes } from "./routes/voices";
import { REPLACED, StreamQueue } from "./stream-queue";

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
  /** Only these extension ids may call (the part after chrome-extension://). Default: any extension that has the token. */
  allowedExtensions?: string[];
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

const ROUTES: readonly Route[] = [...statusRoutes, ...speakRoutes, ...engineRoutes, ...voiceRoutes, ...exportRoutes];

/** Wires the pieces: the guard (Host, Origin, token), the route table, the stream queue and the engines. */
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
  const loadAtStart = plain.loadAtStart ?? env.SPEAKKIT_LOAD_AT_START ?? false;
  const idle = plain.idleUnloadMs ?? env.SPEAKKIT_IDLE_MS;
  let boundPort = plain.port ?? 47615;
  const sockets = new Set<Socket>();

  const queue = new StreamQueue(plain.maxStreams ?? env.SPEAKKIT_MAX_STREAMS ?? DEFAULT_MAX_STREAMS, plain.maxQueue ?? env.SPEAKKIT_MAX_QUEUE ?? DEFAULT_MAX_QUEUE);
  const exporter = new ExportManager(join(dataDir, "exports"), { acquireSlot: (ac) => queue.slot(ac), render });
  const engines = new EngineRegistry({ kokoro, ...(opts.chatterbox && { chatterbox: opts.chatterbox }) }, dataDir, () => {
    queue.abortAll(REPLACED);
    exporter.abortAll();
  });
  if (idle !== undefined) for (const e of engines.all()) e.setIdleUnloadMs?.(idle);

  const token = loadToken(dataDir, plain.token);
  const authorized = tokenChecker(token);
  const services: Services = { engines, exporter, queue, version };
  const allowedExtensions = opts.allowedExtensions ?? env.SPEAKKIT_EXTENSION_IDS;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = guardRequest(req, res, { port: () => boundPort, allowedExtensions });
    const method = req.method ?? "GET";
    if (method === "OPTIONS") return preflight(res, origin);
    const { route, params } = resolveRoute(ROUTES, method, new URL(req.url ?? "/", "http://x").pathname);
    if (route.auth !== false && !authorized(req)) throw new HttpError(401, "token-rejected", "missing or wrong token");
    await route.handle({ req, res, params }, services);
  }

  const server: Server = httpServer((req, res) => {
    handle(req, res).catch((e) => {
      if (res.headersSent) return void res.destroy();
      const h = toHttp(e);
      for (const [k, v] of Object.entries(h.headers ?? {})) res.setHeader(k, v);
      json(res, h.status, { error: { code: h.code, message: h.message, ...h.extra } });
    });
  });
  server.on("connection", (s) => {
    s.setNoDelay(true);
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });

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
      queue.abortAll();
      await exporter.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const s of sockets) s.destroy();
      });
    },
  };
}
