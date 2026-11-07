import { afterEach, describe, expect, it } from "vite-plus/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FrameDecoder, FRAMES_CONTENT_TYPE } from "@speakkit/protocol";
import { FakeEngine } from "@speakkit/engine";
import { createServer } from "../src";
import { raw, readFrames, speakBody, start, type Ctx } from "./harness";

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});

const post = (c: Ctx, body: string, headers: Record<string, string> = {}) =>
  fetch(`${c.base}/v1/speak`, {
    method: "POST",
    headers: { ...c.auth, "Content-Type": "application/json", ...headers },
    body,
  });

describe("frames over HTTP", () => {
  it("streams one audio frame per sentence then done", async () => {
    ctx = await start();
    const sentences = ["Hello world.", "Second sentence here.", "Third."];
    const res = await post(ctx, speakBody(sentences));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(FRAMES_CONTENT_TYPE);
    const frames = (await readFrames(res)).map((f) => f.frame);
    expect(frames).toHaveLength(4);
    frames.slice(0, 3).forEach((f, i) => {
      const n = FakeEngine.sampleCount(sentences[i]!, 1);
      expect(f.header).toEqual({
        type: "audio",
        index: i,
        sampleRate: 24000,
        samples: n,
        durationMs: Math.round((n / 24000) * 1000),
      });
      expect(f.pcm!.length).toBe(n);
    });
    expect(frames[3]!.header).toEqual({ type: "done", count: 3 });
  });

  it("flushes each frame as soon as it is synthesized", async () => {
    ctx = await start({ latencyMs: 150 });
    const t0 = performance.now();
    const frames = await readFrames(await post(ctx, speakBody(["one", "two", "three"])));
    const audio = frames.filter((f) => f.frame.header.type === "audio");
    expect(audio[0]!.at - t0).toBeLessThan(400); // first frame well before the 450 ms total
    expect(audio[2]!.at - audio[0]!.at).toBeGreaterThan(200); // later frames arrive later, not in one burst
  });

  it("applies min(speed, 2) in the engine", async () => {
    ctx = await start();
    await readFrames(await post(ctx, speakBody(["abc"], { speed: 3 })));
    await readFrames(await post(ctx, speakBody(["abc"], { speed: 1.5, voice: "bf_emma" })));
    expect(ctx.engine.calls).toEqual([
      { text: "abc", voice: "af_heart", speed: 2 },
      { text: "abc", voice: "bf_emma", speed: 1.5 },
    ]);
  });

  it("answers the voices endpoint", async () => {
    ctx = await start();
    const r = await fetch(`${ctx.base}/v1/voices`, { headers: ctx.auth });
    const body = (await r.json()) as { voices: { id: string }[]; default: string };
    expect(body.default).toBe("af_heart");
    expect(body.voices).toHaveLength(28);
  });
});

describe("auth, Origin and Host", () => {
  it("requires the token everywhere except health", async () => {
    ctx = await start();
    expect((await fetch(`${ctx.base}/v1/health`)).status).toBe(200);
    for (const [m, p] of [
      ["GET", "/v1/auth/check"],
      ["GET", "/v1/voices"],
      ["POST", "/v1/speak"],
    ] as const) {
      expect((await raw(ctx, m, p, { Host: `127.0.0.1:${ctx.server.port}` }, m === "POST" ? speakBody(["x"]) : undefined)).status).toBe(401);
      expect(
        (
          await raw(ctx, m, p, {
            Host: `127.0.0.1:${ctx.server.port}`,
            Authorization: "Bearer nope",
          })
        ).status,
      ).toBe(401);
    }
    expect((await fetch(`${ctx.base}/v1/auth/check`, { headers: ctx.auth })).status).toBe(204);
    const bad = await raw(ctx, "GET", "/v1/auth/check", { Host: `127.0.0.1:${ctx.server.port}` });
    expect(JSON.parse(bad.body).error.code).toBe("token-rejected");
  });

  it("rejects web origins even with a valid token", async () => {
    ctx = await start();
    const host = `127.0.0.1:${ctx.server.port}`;
    for (const origin of ["https://evil.example", "http://localhost:3000", "null"]) {
      const r = await raw(ctx, "GET", "/v1/voices", { Host: host, Origin: origin, ...ctx.auth });
      expect(r.status).toBe(403);
      expect(r.headers["access-control-allow-origin"]).toBeUndefined();
    }
    expect((await raw(ctx, "GET", "/v1/health", { Host: host, Origin: "https://evil.example" })).status).toBe(403);
    expect((await raw(ctx, "OPTIONS", "/v1/speak", { Host: host, Origin: "https://evil.example" })).status).toBe(403);
  });

  it("accepts chrome-extension origins with CORS headers and answers preflight", async () => {
    ctx = await start();
    const host = `127.0.0.1:${ctx.server.port}`;
    const origin = "chrome-extension://abcdefghijklmnop";
    const r = await raw(ctx, "GET", "/v1/voices", { Host: host, Origin: origin, ...ctx.auth });
    expect(r.status).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBe(origin);
    const pre = await raw(ctx, "OPTIONS", "/v1/speak", {
      Host: host,
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    });
    expect(pre.status).toBe(204);
    expect(pre.headers["access-control-allow-origin"]).toBe(origin);
    expect(String(pre.headers["access-control-allow-headers"]).toLowerCase()).toContain("authorization");
    expect(String(pre.headers["access-control-allow-methods"])).toContain("POST");
  });

  it("lists every method the API uses in the preflight answer", async () => {
    ctx = await start();
    const pre = await raw(ctx, "OPTIONS", "/v1/voices/cb_00000000", { Host: `127.0.0.1:${ctx.server.port}`, Origin: "chrome-extension://abcdefghijklmnop", "Access-Control-Request-Method": "PATCH" });
    expect(pre.headers["access-control-allow-methods"]).toBe("GET, POST, PATCH, DELETE, OPTIONS");
  });

  it("pins the allowed extensions when asked: another extension id is refused even with the token", async () => {
    ctx = await start({}, undefined, { allowedExtensions: ["abcdefghijklmnop"] });
    const host = `127.0.0.1:${ctx.server.port}`;
    const call = (origin: string) => raw(ctx!, "GET", "/v1/voices", { Host: host, Origin: origin, ...ctx!.auth });
    expect((await call("chrome-extension://abcdefghijklmnop")).status).toBe(200);
    expect((await call("chrome-extension://zzzzzzzzzzzzzzzz")).status).toBe(403);
    expect((await raw(ctx, "GET", "/v1/voices", { Host: host, ...ctx.auth })).status).toBe(200);
  });

  it("rejects foreign Host headers (DNS rebinding) and accepts localhost", async () => {
    ctx = await start();
    const p = ctx.server.port;
    for (const host of ["evil.example", `evil.example:${p}`, "127.0.0.1", `127.0.0.1:${p + 1}`, `[::1]:${p}`]) {
      expect((await raw(ctx, "GET", "/v1/health", { Host: host })).status).toBe(403);
    }
    expect((await raw(ctx, "GET", "/v1/health", { Host: `localhost:${p}` })).status).toBe(200);
  });

  it("returns 404 and 405 for unknown routes and methods", async () => {
    ctx = await start();
    const host = `127.0.0.1:${ctx.server.port}`;
    expect((await raw(ctx, "GET", "/nope", { Host: host })).status).toBe(404);
    expect((await raw(ctx, "GET", "/v1/speak", { Host: host, ...ctx.auth })).status).toBe(405);
  });

  it("persists a generated token in the data dir and honours an explicit one", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "speakkit-tok-"));
    const a = createServer({ engine: new FakeEngine(), dataDir, port: 0 });
    const b = createServer({ engine: new FakeEngine(), dataDir, port: 0 });
    const c = createServer({ engine: new FakeEngine(), dataDir, port: 0, token: "fixed" });
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(b.token).toBe(a.token);
    expect(c.token).toBe("fixed");
  });
});

describe("abort", () => {
  it("stops synthesis when the client disconnects", async () => {
    ctx = await start({ latencyMs: 100 });
    const ac = new AbortController();
    const res = await fetch(`${ctx.base}/v1/speak`, {
      method: "POST",
      headers: { ...ctx.auth, "Content-Type": "application/json" },
      body: speakBody(Array.from({ length: 50 }, (_, i) => `sentence ${i}`)),
      signal: ac.signal,
    });
    const reader = res.body!.getReader();
    await reader.read(); // first frame arrived
    ac.abort();
    await reader.read().catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    const e = ctx.engine;
    expect(e.active).toBe(0);
    expect(e.calls.length).toBeLessThan(6); // 50 sentences would take 5 s; it stopped almost immediately
    const seen = e.calls.length;
    await new Promise((r) => setTimeout(r, 300));
    expect(e.calls.length).toBe(seen); // and nothing more is started afterwards
    expect(e.aborted).toBeGreaterThanOrEqual(1);
  });

  it("aborts active streams when the server closes", async () => {
    ctx = await start({ latencyMs: 100 });
    const res = await fetch(`${ctx.base}/v1/speak`, {
      method: "POST",
      headers: { ...ctx.auth, "Content-Type": "application/json" },
      body: speakBody(Array.from({ length: 50 }, () => "x")),
    });
    await res.body!.getReader().read();
    await ctx.server.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(ctx.engine.active).toBe(0);
    expect(ctx.engine.calls.length).toBeLessThan(6);
  });
});

describe("invalid bodies", () => {
  const cases: [string, string][] = [
    ["not JSON", "{oops"],
    ["array body", "[]"],
    ["missing sentences", JSON.stringify({ voice: "af_heart", speed: 1 })],
    ["empty sentences", speakBody([])],
    ["501 sentences", speakBody(Array.from({ length: 501 }, () => "x"))],
    ["non-string sentence", speakBody([1 as unknown as string])],
    ["empty sentence", speakBody([""])],
    ["blank sentence", speakBody(["   "])],
    ["2001-char sentence", speakBody(["x".repeat(2001)])],
    ["unknown voice", speakBody(["hi"], { voice: "xx_nobody" })],
    ["missing voice", JSON.stringify({ sentences: ["hi"], speed: 1 })],
    ["speed too low", speakBody(["hi"], { speed: 0.4 })],
    ["speed too high", speakBody(["hi"], { speed: 3.01 })],
    ["speed as string", speakBody(["hi"], { speed: "1" })],
    ["missing speed", JSON.stringify({ sentences: ["hi"], voice: "af_heart" })],
  ];
  for (const [name, body] of cases) {
    it(`400 for ${name}`, async () => {
      ctx = await start();
      const r = await post(ctx, body);
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe("invalid-request");
      expect(ctx.engine.calls).toHaveLength(0);
    });
  }

  it("accepts the limits: 500 sentences, 2000 chars, speeds 0.5 and 3", async () => {
    ctx = await start();
    const ok = await readFrames(await post(ctx, speakBody(["x"], { speed: 0.5 })));
    expect(ok.at(-1)!.frame.header.type).toBe("done");
    expect((await post(ctx, speakBody(["x".repeat(2000)], { speed: 3 }))).status).toBe(200);
    const many = await readFrames(await post(ctx, speakBody(Array.from({ length: 500 }, () => "a"))));
    expect(many.at(-1)!.frame.header).toEqual({ type: "done", count: 500 });
  });

  it("413 for oversized bodies", async () => {
    ctx = await start();
    const r = await post(ctx, "x".repeat(3 * 1024 * 1024)).catch(() => null);
    if (r) expect(r.status).toBe(413); // the server may also reset the connection while the client is still sending
  });
});

describe("health states", () => {
  it("reports engine state and progress, and speak refuses while not ready", async () => {
    ctx = await start({ state: "downloading" });
    ctx.engine.setStatus({ state: "downloading", progress: 0.42 });
    let h = (await (await fetch(`${ctx.base}/v1/health`)).json()) as any;
    expect(h).toEqual({
      app: "speakkit",
      version: "9.9.9",
      apiVersion: 1,
      engine: { id: "kokoro", state: "downloading", progress: 0.42 },
    });

    const frames = (await readFrames(await post(ctx, speakBody(["hi"])))).map((f) => f.frame.header);
    expect(frames).toEqual([{ type: "error", code: "engine-not-ready", message: "engine is downloading" }]);

    ctx.engine.setStatus({ state: "loading" });
    h = await (await fetch(`${ctx.base}/v1/health`)).json();
    expect(h.engine).toEqual({ id: "kokoro", state: "loading" });

    ctx.engine.setStatus({ state: "error", detail: "boom" });
    h = await (await fetch(`${ctx.base}/v1/health`)).json();
    expect(h.engine).toEqual({ id: "kokoro", state: "error", detail: "boom" });

    await ctx.engine.start();
    h = await (await fetch(`${ctx.base}/v1/health`)).json();
    expect(h.engine.state).toBe("ready");
  });

  it("sends an error frame when synthesis fails mid-stream, after earlier frames", async () => {
    ctx = await start({ failOn: (t) => t === "bad" });
    const frames = (await readFrames(await post(ctx, speakBody(["good", "bad", "never"])))).map((f) => f.frame.header);
    expect(frames.map((h) => h.type)).toEqual(["audio", "error"]);
    expect(frames[1]).toMatchObject({
      type: "error",
      code: "synthesis-failed",
      message: "fake engine failure",
    });
    expect(ctx.engine.calls.map((c) => c.text)).toEqual(["good", "bad"]);
  });

  it("keeps serving after a failed or aborted request", async () => {
    ctx = await start({ failOn: (t) => t === "bad" });
    await readFrames(await post(ctx, speakBody(["bad"])));
    const frames = await readFrames(await post(ctx, speakBody(["ok"])));
    expect(frames.at(-1)!.frame.header.type).toBe("done");
    const dec = new FrameDecoder();
    expect(dec.push(new Uint8Array(0))).toEqual([]);
  });
});
