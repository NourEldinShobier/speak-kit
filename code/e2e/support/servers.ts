import http, { createServer as createHttp, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeEngine, type FakeEngineOptions } from "@speakkit/engine";
import { createServer as createSpeakServer } from "@speakkit/server";
import * as pages from "./pages";

const routes: Record<string, () => string> = {
  "/article": pages.article,
  "/short": pages.shortPage,
  "/tall": () => pages.tallPage(),
  "/dark": pages.darkPage,
  "/lists": pages.listsPage,
  "/select": pages.selectPage,
  "/big": () => pages.bigPage(5000),
  "/blank": pages.blank,
  "/paper.pdf": pages.shortPage,
};

export interface Fixture {
  origin: string;
  host: string;
  url(path: string): string;
  close(): Promise<void>;
}

/** Fixture pages are served as http://localhost:<port> so the options page accepts the host in site rules. */
export async function startFixture(): Promise<Fixture> {
  const big = new Map<string, string>();
  const srv: Server = createHttp((req, res) => {
    const path = (req.url ?? "/").split("?")[0]!;
    if (path === "/favicon.ico") return void res.writeHead(204).end();
    const make = routes[path];
    if (!make) {
      res.writeHead(404).end("not found");
      return;
    }
    let html = big.get(path);
    if (!html) big.set(path, (html = make()));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  });
  await new Promise<void>((r) => srv.listen(0, r));
  const port = (srv.address() as { port: number }).port;
  return {
    origin: `http://localhost:${port}`,
    host: "localhost",
    url: (p) => `http://localhost:${port}${p}`,
    close: () => new Promise((r) => srv.close(() => r())),
  };
}

export interface Hit {
  port: number;
  method: string;
  path: string;
  /** X-SpeakKit-Replace was sent */
  replace: boolean;
  at: number;
}
const hits: Hit[] = [];
// Every request any in-process server in this worker receives, so tests can count what the extension sends.
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (this: Server, ev: string, ...a: unknown[]) {
  if (ev === "request") {
    const req = a[0] as import("node:http").IncomingMessage;
    hits.push({
      port: req.socket.localPort ?? 0,
      method: req.method ?? "",
      path: (req.url ?? "").split("?")[0]!,
      replace: !!req.headers["x-speakkit-replace"] && req.headers["x-speakkit-replace"] !== "0",
      at: Date.now(),
    });
  }
  return (emit as (...x: unknown[]) => boolean).call(this, ev, ...a);
} as typeof emit;

export interface App {
  engine: FakeEngine;
  /** Requests this app received (all of them, in order). */
  hits(path?: string): Hit[];
  /** ms values the extension sent to POST /v1/engine/hold. */
  holds: number[];
  port: number;
  token: string;
  /** Server version string reported by /v1/health. */
  start(): Promise<void>;
  stop(): Promise<void>;
  running: boolean;
}

export interface AppOptions extends FakeEngineOptions {
  token?: string;
  port?: number;
  /** Server concurrency limits (defaults 2 running, 8 queued). */
  maxStreams?: number;
  maxQueue?: number;
}

/** The real packages/server on a random loopback port with the fake engine. Can be stopped and restarted on the same port and token. */
export async function startApp(o: AppOptions = {}): Promise<App> {
  const engine = new FakeEngine({ secondsPerChar: 0.03, ...o });
  const token = o.token ?? "e2e-token-" + Math.random().toString(16).slice(2).padEnd(24, "0");
  const dataDir = mkdtempSync(join(tmpdir(), "speakkit-e2e-"));
  const limits = { maxStreams: o.maxStreams, maxQueue: o.maxQueue };
  const holds: number[] = [];
  const hold = engine.hold?.bind(engine);
  engine.hold = (ms: number) => (holds.push(ms), hold?.(ms));
  let server = createSpeakServer({ engine, dataDir, port: o.port ?? 0, version: "e2e", token, ...limits });
  const app: App = {
    engine,
    holds,
    hits: (path) => hits.filter((h) => h.port === app.port && (!path || h.path === path)),
    port: 0,
    token,
    running: false,
    async start() {
      if (app.running) return;
      server = createSpeakServer({ engine, dataDir, port: app.port, version: "e2e", token, ...limits });
      await server.listen();
      app.port = server.port;
      app.running = true;
    },
    async stop() {
      if (!app.running) return;
      app.running = false;
      await server.close();
    },
  };
  await server.listen();
  app.port = server.port;
  app.running = true;
  if (!o.state) void engine.start();
  return app;
}
