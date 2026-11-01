import { afterEach, describe, expect, it } from "vite-plus/test";
import { FrameDecoder } from "@speakkit/protocol";
import { StalledEngine, readFrames, speakBody, start, type Ctx } from "./harness";

let ctx: Ctx | undefined;
let stalled: StalledEngine | undefined;
afterEach(async () => {
  stalled?.open();
  stalled = undefined;
  await ctx?.server.close();
  ctx = undefined;
});

const post = (c: Ctx, path: string, body: unknown) => fetch(`${c.base}${path}`, { method: "POST", headers: { ...c.auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("stream idle deadline", () => {
  it("a stream that produces no frame ends with a synthesis-failed error frame", async () => {
    stalled = new StalledEngine();
    ctx = await start({}, undefined, { engine: stalled, streamIdleMs: 150 });
    const t0 = performance.now();
    const frames = await readFrames(await fetch(`${ctx.base}/v1/speak`, { method: "POST", headers: { ...ctx.auth, "Content-Type": "application/json" }, body: speakBody(["x"]) }));
    expect(frames.map((f) => f.frame.header)).toEqual([{ type: "error", code: "synthesis-failed", message: "no audio for 0.15 s" }]);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it("the slot is given back, so the next stream is served", async () => {
    stalled = new StalledEngine();
    ctx = await start({}, undefined, { engine: stalled, streamIdleMs: 100, maxStreams: 1 });
    const speak = () => fetch(`${ctx!.base}/v1/speak`, { method: "POST", headers: { ...ctx!.auth, "Content-Type": "application/json" }, body: speakBody(["x"]) });
    const first = await readFrames(await speak());
    const second = await readFrames(await speak());
    expect(first[0]!.frame.header).toMatchObject({ type: "error", code: "synthesis-failed" });
    expect(second[0]!.frame.header).toMatchObject({ type: "error", code: "synthesis-failed" });
  });

  it("a model that is still loading is not a stall", async () => {
    ctx = await start({ state: "unloaded", loadMs: 400 }, undefined, { streamIdleMs: 100 });
    const frames = await readFrames(await fetch(`${ctx.base}/v1/speak`, { method: "POST", headers: { ...ctx.auth, "Content-Type": "application/json" }, body: speakBody(["x"]) }));
    expect(frames.map((f) => f.frame.header.type)).toEqual(["audio", "done"]);
  });

  it("time spent waiting for a slot does not count", async () => {
    ctx = await start({ latencyMs: 250 }, undefined, { streamIdleMs: 400, maxStreams: 1 });
    const speak = () => fetch(`${ctx!.base}/v1/speak`, { method: "POST", headers: { ...ctx!.auth, "Content-Type": "application/json" }, body: speakBody(["a", "b", "c"]) }).then(readFrames);
    const [a, b] = await Promise.all([speak(), speak()]);
    for (const frames of [a, b]) expect(frames.map((f) => f.frame.header.type)).toEqual(["audio", "audio", "audio", "done"]);
  });
});

describe("a paused read", () => {
  it("is not a stall: the client stops reading for many idle windows and the stream still completes", async () => {
    ctx = await start({ secondsPerChar: 0.06 }, undefined, { streamIdleMs: 100 });
    const sentences = Array.from({ length: 40 }, () => "x".repeat(400)); // about 1.1 MB of audio each, far more than the socket buffers hold
    const res = await fetch(`${ctx.base}/v1/speak`, { method: "POST", headers: { ...ctx.auth, "Content-Type": "application/json" }, body: speakBody(sentences) });
    const reader = res.body!.getReader();
    const dec = new FrameDecoder();
    const types: string[] = [];
    const pull = async () => {
      const { done, value } = await reader.read();
      if (done) return false;
      for (const f of dec.push(value)) types.push(f.header.type);
      return true;
    };
    await pull();
    await new Promise((r) => setTimeout(r, 600)); // six idle windows with nothing read
    expect(ctx.engine.calls.length).toBeLessThan(sentences.length); // the server was held back by the full socket, not finished
    while (await pull());
    expect(types.filter((t) => t === "audio")).toHaveLength(sentences.length);
    expect(types.at(-1)).toBe("done");
    expect(types).not.toContain("error");
  });
});

describe("control route deadline", () => {
  it("answers 504 when a control route does not finish in time", async () => {
    stalled = new StalledEngine();
    ctx = await start({}, undefined, { engine: stalled, controlDeadlineMs: 150 });
    const job = (await (await post(ctx, "/v1/export", { sentences: ["a"], voice: "af_heart", speed: 1 })).json()) as { id: string };
    await new Promise((r) => setTimeout(r, 50));
    // cancel waits for the job to settle, and the stalled engine ignores the abort
    const r = await fetch(`${ctx.base}/v1/export/${job.id}`, { method: "DELETE", headers: ctx.auth });
    expect(r.status).toBe(504);
    expect(await r.json()).toEqual({ error: { code: "internal", message: "no answer within 0.15 s" } });
  });

  it("does not apply to the speak stream: a stream longer than the control deadline completes", async () => {
    ctx = await start({ latencyMs: 80 }, undefined, { controlDeadlineMs: 100 });
    const frames = await readFrames(await fetch(`${ctx.base}/v1/speak`, { method: "POST", headers: { ...ctx.auth, "Content-Type": "application/json" }, body: speakBody(["a", "b", "c", "d"]) }));
    expect(frames.map((f) => f.frame.header.type)).toEqual(["audio", "audio", "audio", "audio", "done"]);
  });

  it("does not cut a finished export's audio download short", async () => {
    ctx = await start({ secondsPerChar: 1 }, undefined, { controlDeadlineMs: 5000 });
    const job = (await (await post(ctx, "/v1/export", { sentences: ["abcdefghij"], voice: "af_heart", speed: 1 })).json()) as { id: string };
    for (;;) {
      const j = (await (await fetch(`${ctx.base}/v1/export/${job.id}`, { headers: ctx.auth })).json()) as { state: string };
      if (j.state === "done") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const audio = await fetch(`${ctx.base}/v1/export/${job.id}/audio`, { headers: ctx.auth });
    expect((await audio.arrayBuffer()).byteLength).toBe(44 + 10 * 24000 * 2);
  });
});
