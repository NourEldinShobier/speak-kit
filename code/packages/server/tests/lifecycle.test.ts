import { afterEach, describe, expect, it } from "vite-plus/test";
import type { Health } from "@speakkit/protocol";
import { raw, readFrames, speakBody, start, type Ctx } from "./harness";

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
  delete process.env.SPEAKKIT_IDLE_MS;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout waiting for condition");
    await sleep(5);
  }
}
const json = { "Content-Type": "application/json" };
const post = (c: Ctx, path: string, body = "", headers: Record<string, string> = {}) => fetch(`${c.base}${path}`, { method: "POST", headers: { ...c.auth, ...headers }, body: body || null });
const speak = (c: Ctx, sentences: string[], headers: Record<string, string> = {}, extra = {}) => post(c, "/v1/speak", speakBody(sentences, extra), { ...json, ...headers });
const health = async (c: Ctx) => ((await (await fetch(`${c.base}/v1/health`)).json()) as Health).engine;

describe("lazy engine over HTTP", () => {
  it("does not load at start; the first /v1/speak loads it and streams normally", async () => {
    ctx = await start({ state: "unloaded", loadMs: 50 });
    expect((await health(ctx)).state).toBe("unloaded");
    expect(ctx.engine.loads).toBe(0);
    const frames = (await readFrames(await speak(ctx, ["one", "two"]))).map((f) => f.frame.header.type);
    expect(frames).toEqual(["audio", "audio", "done"]);
    expect(ctx.engine.loads).toBe(1);
    expect((await health(ctx)).state).toBe("ready");
  });

  it("loadAtStart loads right after listening", async () => {
    ctx = await start({ state: "unloaded" }, undefined, { loadAtStart: true });
    await until(() => ctx!.engine.status().state === "ready");
    expect(ctx.engine.loads).toBe(1);
  });

  it("requests that arrive while loading wait instead of failing", async () => {
    ctx = await start({ state: "unloaded", loadMs: 120 });
    const [a, b] = await Promise.all([speak(ctx, ["a"]), speak(ctx, ["b"])]);
    for (const r of [a, b]) {
      expect((await readFrames(r)).map((f) => f.frame.header.type)).toEqual(["audio", "done"]);
    }
    expect(ctx.engine.loads).toBe(1);
  });

  it("a missing model answers with an engine-not-ready error frame", async () => {
    ctx = await start({ state: "missing" });
    const frames = await readFrames(await speak(ctx, ["x"]));
    expect(frames.map((f) => f.frame.header)).toEqual([{ type: "error", code: "engine-not-ready", message: "engine is missing" }]);
  });
});

describe("idle unload through the server", () => {
  it("unloads after the idle window, reports it in health, and reloads on the next request", async () => {
    ctx = await start({ state: "unloaded" }, undefined, { idleUnloadMs: 150 });
    await readFrames(await speak(ctx, ["hi"]));
    const h = await health(ctx);
    expect(h.state).toBe("ready");
    expect(h.idleUnloadAtMs).toBeGreaterThan(Date.now() - 1);
    expect(h.idleUnloadAtMs).toBeLessThan(Date.now() + 151);
    await until(() => ctx!.engine.status().state === "unloaded");
    const h2 = await health(ctx);
    expect(h2.state).toBe("unloaded");
    expect(h2.idleUnloadAtMs).toBeUndefined();
    await readFrames(await speak(ctx, ["again"]));
    expect(ctx.engine.loads).toBe(2);
  });

  it("two quick reads after an idle unload both stream audio and the model reloads once", async () => {
    ctx = await start({ state: "unloaded", loadMs: 80 }, undefined, { idleUnloadMs: 100 });
    await readFrames(await speak(ctx, ["hi"]));
    await until(() => ctx!.engine.status().state === "unloaded");
    const first = speak(ctx, ["one"]);
    await sleep(20);
    const second = speak(ctx, ["two"]);
    for (const r of await Promise.all([first, second])) {
      expect((await readFrames(r)).map((f) => f.frame.header.type)).toEqual(["audio", "done"]);
    }
    expect(ctx.engine.loads).toBe(2);
    expect(ctx.engine.unloads).toBe(1);
  });

  it("env SPEAKKIT_IDLE_MS sets the window", async () => {
    process.env.SPEAKKIT_IDLE_MS = "60";
    ctx = await start({ state: "unloaded" });
    await readFrames(await speak(ctx, ["hi"]));
    await until(() => ctx!.engine.status().state === "unloaded");
    expect(ctx.engine.unloads).toBe(1);
  });

  it("never unloads while a stream is active", async () => {
    ctx = await start({ state: "unloaded", latencyMs: 120 }, undefined, { idleUnloadMs: 30 });
    const frames = await readFrames(await speak(ctx, ["a", "b", "c", "d"])); // about 480 ms
    expect(frames.at(-1)!.frame.header.type).toBe("done");
    expect(ctx.engine.unloads).toBe(0);
    await until(() => ctx!.engine.status().state === "unloaded");
  });

  it("setIdleUnloadMs changes the window at runtime", async () => {
    ctx = await start({ state: "unloaded" }, undefined, { idleUnloadMs: 60_000 });
    await readFrames(await speak(ctx, ["hi"]));
    ctx.server.setIdleUnloadMs(40);
    await until(() => ctx!.engine.status().state === "unloaded");
  });

  it("setOnBattery shortens the window", async () => {
    ctx = await start({ state: "unloaded", batteryIdleMs: 40 }, undefined, { idleUnloadMs: 60_000 });
    await readFrames(await speak(ctx, ["hi"]));
    ctx.server.setOnBattery(true);
    await until(() => ctx!.engine.status().state === "unloaded");
  });
});

describe("POST /v1/engine/warm", () => {
  it("needs the token", async () => {
    ctx = await start({ state: "unloaded" });
    expect((await fetch(`${ctx.base}/v1/engine/warm`, { method: "POST" })).status).toBe(404);
    expect(ctx.engine.loads).toBe(0);
  });

  it("answers 202 immediately, loads once however often it is called, and makes the next speak fast", async () => {
    ctx = await start({ state: "unloaded", loadMs: 150 });
    const t0 = performance.now();
    const rs = await Promise.all([1, 2, 3].map(() => post(ctx!, "/v1/engine/warm")));
    expect(performance.now() - t0).toBeLessThan(100);
    expect(rs.map((r) => r.status)).toEqual([202, 202, 202]);
    expect(await rs[0]!.json()).toEqual({ state: "loading" });
    await until(() => ctx!.engine.status().state === "ready");
    expect((await post(ctx, "/v1/engine/warm")).status).toBe(202);
    expect(ctx.engine.loads).toBe(1);
    const t1 = performance.now();
    const frames = await readFrames(await speak(ctx, ["hello"]));
    expect(frames[0]!.at - t1).toBeLessThan(100);
  });

  it("rejects other methods", async () => {
    ctx = await start({ state: "unloaded" });
    const r = await fetch(`${ctx.base}/v1/engine/warm`, { headers: ctx.auth });
    expect(r.status).toBe(405);
    expect(await r.json()).toEqual({ error: { code: "method-not-allowed", message: "use POST" } });
  });
});

describe("POST /v1/engine/hold", () => {
  it("keeps the model past the idle window until released", async () => {
    ctx = await start({ state: "unloaded" }, undefined, { idleUnloadMs: 40 });
    await readFrames(await speak(ctx, ["hi"]));
    const r = await post(ctx, "/v1/engine/hold", JSON.stringify({ ms: 60_000 }), json);
    expect(r.status).toBe(204);
    await sleep(200);
    expect(ctx.engine.status().state).toBe("ready");
    expect((await post(ctx, "/v1/engine/hold", JSON.stringify({ ms: 0 }), json)).status).toBe(204);
    await until(() => ctx!.engine.status().state === "unloaded");
  });

  it("validates the body with the usual error shape", async () => {
    ctx = await start();
    for (const body of ['{"ms":-1}', '{"ms":1.5}', '{"ms":"x"}', "{}", "[]", "nope"]) {
      const r = await post(ctx, "/v1/engine/hold", body, json);
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe("invalid-request");
    }
    const big = await post(ctx, "/v1/engine/hold", '{"ms":3600001}', json);
    expect(await big.json()).toEqual({
      error: { code: "invalid-request", message: "ms must be an integer between 0 and 3600000" },
    });
  });
});

describe("concurrency cap and replace", () => {
  it("queues beyond maxStreams FIFO and answers 429 busy beyond maxQueue", async () => {
    ctx = await start({ latencyMs: 600 }, undefined, { maxStreams: 1, maxQueue: 1 });
    const order: string[] = [];
    const run = async (name: string) => {
      const r = await speak(ctx!, [name]);
      await readFrames(r);
      order.push(name);
    };
    const first = run("first");
    await sleep(30);
    const second = run("second"); // queued
    await sleep(30);
    const third = await speak(ctx, ["third"]);
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBe("1");
    expect(await third.json()).toEqual({
      error: { code: "busy", message: "at most 1 streams and 1 queued" },
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
    expect(ctx.engine.calls.map((c) => c.text)).toEqual(["first", "second"]);
  });

  it("a slot frees up when a client disconnects while queued", async () => {
    ctx = await start({ latencyMs: 150 }, undefined, { maxStreams: 1, maxQueue: 1 });
    const first = speak(ctx, ["first"]).then(readFrames);
    await sleep(30);
    const ac = new AbortController();
    void fetch(`${ctx.base}/v1/speak`, {
      method: "POST",
      headers: { ...ctx.auth, ...json },
      body: speakBody(["queued"]),
      signal: ac.signal,
    }).catch(() => {});
    await sleep(30);
    ac.abort();
    await sleep(30);
    const again = speak(ctx, ["after"]);
    expect((await again).status).toBe(200);
    await first;
    expect(ctx.engine.calls.map((c) => c.text)).not.toContain("queued");
  });

  it("X-SpeakKit-Replace cancels the running stream and the new one starts at once", async () => {
    ctx = await start({ latencyMs: 200 }, undefined, { maxStreams: 1 });
    const old = await speak(ctx, ["a", "b", "c", "d", "e"]);
    const oldFrames = readFrames(old);
    await sleep(100); // inside the first sentence
    const t0 = performance.now();
    const fresh = await speak(ctx, ["new"], { "X-SpeakKit-Replace": "1" });
    const frames = await readFrames(fresh);
    expect(frames.map((f) => f.frame.header.type)).toEqual(["audio", "done"]);
    expect(frames[0]!.at - t0).toBeLessThan(200 + 150); // one sentence of latency, not the other four
    const stale = (await oldFrames).map((f) => f.frame.header.type);
    expect(stale).not.toContain("done"); // ended without a done frame
    expect(ctx.engine.calls.map((c) => c.text)).toEqual(["a", "new"]);
    expect(ctx.engine.aborted).toBe(1);
  });

  it("replace also drops queued streams", async () => {
    ctx = await start({ latencyMs: 150 }, undefined, { maxStreams: 1, maxQueue: 4 });
    const first = speak(ctx, ["first"]).then(readFrames);
    await sleep(30);
    const queued = speak(ctx, ["queued"]).then(readFrames);
    await sleep(30);
    const fresh = await speak(ctx, ["fresh"], { "X-SpeakKit-Replace": "1" });
    const frames = await readFrames(fresh);
    expect(frames.at(-1)!.frame.header.type).toBe("done");
    expect(await queued).toEqual([]);
    await first;
    expect(ctx.engine.calls.map((c) => c.text)).toEqual(["first", "fresh"]);
  });

  it("preflight allows the replace header", async () => {
    ctx = await start();
    const r = await raw(ctx, "OPTIONS", "/v1/speak", {
      Host: `127.0.0.1:${ctx.server.port}`,
      Origin: "chrome-extension://abc",
      "Access-Control-Request-Method": "POST",
    });
    expect(String(r.headers["access-control-allow-headers"])).toContain("X-SpeakKit-Replace");
  });
});

describe("validation messages", () => {
  const bad = async (body: string) => {
    const r = await speakRaw(body);
    return { status: r.status, body: await r.json() };
  };
  const speakRaw = (body: string) => post(ctx!, "/v1/speak", body, json);
  const err = (message: string) => ({ status: 400, body: { error: { code: "invalid-request", message } } });

  it("keeps the wire messages", async () => {
    ctx = await start();
    const s = (extra: object) => JSON.stringify({ sentences: ["x"], voice: "af_heart", speed: 1, ...extra });
    expect(await bad("[]")).toEqual(err("body must be a JSON object"));
    expect(await bad('"x"')).toEqual(err("body must be a JSON object"));
    expect(await bad("{")).toEqual(err("body is not valid JSON"));
    expect(await bad(s({ sentences: [] }))).toEqual(err("sentences must be an array of 1..500 strings"));
    expect(await bad(s({ sentences: "x" }))).toEqual(err("sentences must be an array of 1..500 strings"));
    expect(await bad(s({ sentences: Array(501).fill("x") }))).toEqual(err("sentences must be an array of 1..500 strings"));
    expect(await bad(s({ sentences: ["ok", "  "] }))).toEqual(err("sentences[1] must be a non-empty string of at most 2000 characters"));
    expect(await bad(s({ sentences: ["ok", 5] }))).toEqual(err("sentences[1] must be a non-empty string of at most 2000 characters"));
    expect(await bad(s({ sentences: ["x".repeat(2001)] }))).toEqual(err("sentences[0] must be a non-empty string of at most 2000 characters"));
    expect(await bad(s({ voice: "nobody" }))).toEqual(err("unknown voice"));
    expect(await bad(s({ speed: 0.4 }))).toEqual(err("speed must be a number between 0.5 and 3"));
    expect(await bad(s({ speed: "1" }))).toEqual(err("speed must be a number between 0.5 and 3"));
  });
});
