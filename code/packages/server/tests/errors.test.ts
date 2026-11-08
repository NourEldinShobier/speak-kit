import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ErrorCode } from "@speakkit/protocol";
import { FakeEngine } from "@speakkit/engine";
import { raw, readFrames, speakBody, start, type Ctx } from "./harness";

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});

/** Where each wire error code comes from. A new code in the protocol fails the type-check here until it is placed. */
const SOURCE: Record<ErrorCode, "http" | "frame" | "client"> = {
  "app-not-running": "client",
  "token-rejected": "http",
  "engine-not-ready": "frame",
  "page-unreadable": "client",
  "file-access": "client",
  "synthesis-failed": "frame",
  "version-mismatch": "client",
  "invalid-request": "http",
  forbidden: "http",
  busy: "http",
  "not-found": "http",
};

class BrokenVoices extends FakeEngine {
  override voices(): never {
    throw new Error("disk on fire");
  }
}

const json = { "Content-Type": "application/json" };
const send = (c: Ctx, method: string, path: string, body?: unknown, headers: Record<string, string> = c.auth) =>
  fetch(`${c.base}${path}`, { method, headers: { ...json, ...headers }, body: body === undefined ? null : JSON.stringify(body) });
const errorOf = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;
const exportBody = { sentences: ["a"], voice: "af_heart", speed: 1 };

type Case = [ErrorCode | "method-not-allowed" | "internal", number, (c: Ctx) => Promise<Response>];
const HTTP_CASES: Case[] = [
  ["token-rejected", 401, (c) => send(c, "GET", "/v1/auth/check", undefined, {})],
  [
    "forbidden",
    403,
    async (c) => {
      const r = await raw(c, "GET", "/v1/auth/check", { Host: `127.0.0.1:${c.server.port}`, ...c.auth, Origin: "https://evil.example" });
      return new Response(r.body, { status: r.status });
    },
  ],
  ["not-found", 404, (c) => send(c, "GET", "/v1/nothing")],
  ["method-not-allowed", 405, (c) => send(c, "DELETE", "/v1/voices")],
  ["invalid-request", 400, (c) => send(c, "POST", "/v1/speak", { sentences: [], voice: "af_heart", speed: 1 })],
  ["invalid-request", 413, (c) => fetch(`${c.base}/v1/speak`, { method: "POST", headers: { ...c.auth, ...json }, body: "x".repeat(2 * 1024 * 1024 + 1) })],
  [
    "busy",
    409,
    async (c) => {
      const job = (await (await send(c, "POST", "/v1/export", exportBody)).json()) as { id: string };
      return send(c, "GET", `/v1/export/${job.id}/audio`); // still running
    },
  ],
  [
    "busy",
    429,
    async (c) => {
      const slow = [1, 2].map(() => send(c, "POST", "/v1/speak", { sentences: ["x"], voice: "af_heart", speed: 1 }));
      await new Promise((r) => setTimeout(r, 50));
      const refused = await send(c, "POST", "/v1/speak", { sentences: ["y"], voice: "af_heart", speed: 1 });
      await Promise.all(slow.map(async (p) => (await p).arrayBuffer()));
      return refused;
    },
  ],
];

describe("every HTTP error code has a request that produces it", () => {
  it.each(HTTP_CASES)("%s (%i)", async (code, status, make) => {
    ctx = await start({ latencyMs: 200 }, undefined, { maxStreams: 1, maxQueue: 1 });
    const r = await make(ctx);
    expect(r.status).toBe(status);
    expect(await errorOf(r)).toBe(code);
  });

  it("internal (500) hides the cause", async () => {
    const engine = new BrokenVoices();
    ctx = await start({}, undefined, { engine });
    const r = await send(ctx, "GET", "/v1/voices");
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: { code: "internal", message: "internal error" } });
  });
});

describe("error frames", () => {
  it("engine-not-ready when the model is missing", async () => {
    ctx = await start({ state: "missing" });
    const frames = await readFrames(await fetch(`${ctx.base}/v1/speak`, { method: "POST", headers: { ...ctx.auth, ...json }, body: speakBody(["x"]) }));
    expect(frames.map((f) => f.frame.header)).toMatchObject([{ type: "error", code: "engine-not-ready" }]);
  });

  it("synthesis-failed when the engine throws", async () => {
    ctx = await start({ failOn: true });
    const frames = await readFrames(await fetch(`${ctx.base}/v1/speak`, { method: "POST", headers: { ...ctx.auth, ...json }, body: speakBody(["x"]) }));
    expect(frames.map((f) => f.frame.header)).toEqual([{ type: "error", code: "synthesis-failed", message: "fake engine failure" }]);
  });
});

it("every code the server can produce is covered above", () => {
  const covered = new Set<string>([...HTTP_CASES.map((c) => c[0]), "internal", "engine-not-ready", "synthesis-failed"]);
  const missing = Object.entries(SOURCE).filter(([code, from]) => from !== "client" && !covered.has(code));
  expect(missing).toEqual([]);
});

describe("error bodies", () => {
  it("carry no stack, path or cause", async () => {
    ctx = await start();
    const r = await raw(ctx, "GET", "/v1/nothing", { Host: `127.0.0.1:${ctx.server.port}`, ...ctx.auth });
    expect(JSON.parse(r.body)).toEqual({ error: { code: "not-found", message: "no such endpoint" } });
  });
});
