import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ErrorCode } from "@speakkit/protocol";
import { RequestError } from "./config";
import { ExportFullError } from "./export";

const MAX_BODY = 2 * 1024 * 1024;

export class HttpError extends Error {
  status: number;
  code: ErrorCode | "method-not-allowed" | "internal";
  /** Response headers to send with the error (Allow on a 405, Retry-After on a 429). */
  headers?: Record<string, string> | undefined;
  constructor(status: number, code: HttpError["code"], message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  /** Adds response headers. */
  with(more: { headers?: Record<string, string> }): this {
    return Object.assign(this, more);
  }
}

export function toHttp(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof ExportFullError) return new HttpError(429, "busy", e.message);
  return new HttpError(500, "internal", "internal error");
}

export async function readBody(req: IncomingMessage, max = MAX_BODY): Promise<unknown> {
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

/** The body as bytes, refused above `max` (413) before more is read. */
export async function readBytes(req: IncomingMessage, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    n += c.length;
    if (n > max) throw new HttpError(413, "invalid-request", "body too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/**
 * Fails with 504 when `work` takes longer than `ms` and aborts `ac` with that error, so a handler that checks its signal before it
 * creates state stops there. The abandoned work keeps running until it does; its result is dropped.
 */
export async function withDeadline<T>(work: Promise<T> | T, ms: number, ac: AbortController): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new HttpError(504, "internal", `no answer within ${ms / 1000} s`);
      ac.abort(e);
      reject(e);
    }, ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `fn` on a validation failure as a 400 invalid-request. */
export function validated<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RequestError) throw new HttpError(400, "invalid-request", e.message);
    throw e;
  }
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": data.length, "Cache-Control": "no-store" });
  res.end(data);
}

export function noContent(res: ServerResponse): void {
  res.writeHead(204);
  res.end();
}

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Bearer-token check in constant time. */
export function tokenChecker(token: string): (req: IncomingMessage) => boolean {
  const tokenHash = sha(token);
  return (req) => {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    return !!m && timingSafeEqual(sha(m[1]!), tokenHash);
  };
}

const EXTENSION_ORIGIN = "chrome-extension://";

export interface GuardOptions {
  port(): number;
  /** Extension ids allowed to call; undefined allows every extension (the bearer token is then the only gate). */
  allowedExtensions?: readonly string[];
}

/**
 * Checks Host (DNS rebinding) and Origin (CSRF) before anything is routed, and sets the CORS headers for an extension origin.
 * Returns the Origin header (undefined for non-browser clients).
 */
export function guardRequest(req: IncomingMessage, res: ServerResponse, o: GuardOptions): string | undefined {
  const port = o.port();
  const host = req.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) throw new HttpError(403, "forbidden", "bad Host header");
  const origin = req.headers.origin;
  if (origin !== undefined) {
    if (!origin.startsWith(EXTENSION_ORIGIN)) throw new HttpError(403, "forbidden", "origin not allowed");
    if (o.allowedExtensions && !o.allowedExtensions.includes(origin.slice(EXTENSION_ORIGIN.length))) throw new HttpError(403, "forbidden", "this extension is not paired");
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  return origin;
}

export function preflight(res: ServerResponse, origin: string | undefined): void {
  if (!origin) throw new HttpError(403, "forbidden", "preflight needs an extension origin");
  res.writeHead(204, {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-SpeakKit-Replace",
    "Access-Control-Max-Age": "600",
  });
  res.end();
}
