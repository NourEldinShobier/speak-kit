import { randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import * as v from "valibot";
import { ControlRequestSchema, fail, LIMITS, type ControlRequest, type Reply } from "../../shared/control/contract";
import { discoveryFile, removeDiscovery, writeDiscovery } from "./discovery";

interface Options {
  dataDir: string;
  version: string;
  dispatch(req: ControlRequest): Promise<Reply>;
  /** The time a command may take before it is answered with a timeout; tests make it short. */
  timeoutMs?: number;
}

export interface ControlServer {
  /** The port once started. */
  readonly port: number;
  readonly running: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** A new token, written to the discovery file at once. Whoever holds the old one is refused from now on. No-op while stopped. */
  resetToken(): Promise<void>;
}

const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** A dictate command may wait for the person to finish speaking; everything else ends within the normal limit. */
const waitFor = (req: ControlRequest, normal: number): number => (req.command === "dictate" ? LIMITS.printWaitMs * 5 + 5000 : normal);

function send(res: http.ServerResponse, status: number, reply: Reply): void {
  if (res.headersSent || res.writableEnded) return;
  let body = JSON.stringify(reply);
  if (Buffer.byteLength(body) > LIMITS.replyBytes) {
    status = 200;
    body = JSON.stringify(fail("too-large", "The reply is larger than the limit."));
  }
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
  res.end(body);
}

/** Reads the body up to the limit; null when it is larger (the connection is then closed). */
function readBody(req: http.IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > LIMITS.requestBytes) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

async function handle(o: Options & { token(): string }, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const auth = req.headers.authorization ?? "";
  if (req.method !== "POST" || req.url !== "/control" || !auth.startsWith("Bearer ") || !same(auth.slice(7), o.token())) return void res.writeHead(404).end();
  const body = await readBody(req);
  if (body === null) return send(res, 413, fail("too-large", "The request is larger than the limit."));
  let parsed: ControlRequest;
  try {
    parsed = v.parse(ControlRequestSchema, JSON.parse(body));
  } catch {
    return send(res, 400, fail("usage", "The request is not a valid command."));
  }
  const timer = setTimeout(() => send(res, 200, fail("timeout", "The command did not finish in time.")), waitFor(parsed, o.timeoutMs ?? LIMITS.timeoutMs));
  try {
    send(res, 200, await o.dispatch(parsed));
  } catch {
    send(res, 200, fail("failed", "The command failed."));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The local control server: loopback only, one route, a token on every call. A request without the right token gets the same 404 as a route that does not exist, so
 * nothing tells a probe that a server is here. The port and the token are published in the discovery file while it runs.
 */
export function createControlServer(o: Options): ControlServer {
  let token = randomBytes(32).toString("hex");
  let server: http.Server | undefined;
  let port = 0;

  return {
    get port() {
      return port;
    },
    get running() {
      return server?.listening ?? false;
    },
    async start() {
      if (server) return;
      const s = http.createServer((req, res) => void handle({ ...o, token: () => token }, req, res));
      s.requestTimeout = LIMITS.printWaitMs * 6;
      await new Promise<void>((resolve, reject) => {
        s.once("error", reject);
        s.listen(0, "127.0.0.1", resolve);
      });
      server = s;
      port = (s.address() as { port: number }).port;
      await writeDiscovery(discoveryFile(o.dataDir), { port, token, pid: process.pid, version: o.version });
    },
    async resetToken() {
      token = randomBytes(32).toString("hex");
      if (server) await writeDiscovery(discoveryFile(o.dataDir), { port, token, pid: process.pid, version: o.version });
    },
    async stop() {
      const s = server;
      server = undefined;
      await removeDiscovery(discoveryFile(o.dataDir), process.pid);
      if (s) await new Promise<void>((resolve) => (s.closeAllConnections(), s.close(() => resolve())));
    },
  };
}
