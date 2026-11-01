import { afterEach, describe, expect, it } from "vite-plus/test";
import { raw, readFrames, speakBody, start, type Ctx } from "./helpers";

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const speak = (c: Ctx, sentences: string[], replace?: string) =>
  fetch(`${c.base}/v1/speak`, {
    method: "POST",
    headers: { ...c.auth, "Content-Type": "application/json", ...(replace && { "X-SpeakKit-Replace": replace }) },
    body: speakBody(sentences),
  });
const types = async (r: Response) => (await readFrames(r)).map((f) => f.frame.header.type);

describe("X-SpeakKit-Replace stream groups", () => {
  it("an id cancels only earlier streams with the same id", async () => {
    ctx = await start({ latencyMs: 150 }, undefined, { maxStreams: 3 });
    const tabA = speak(ctx, ["a1", "a2", "a3"], "tab-1").then(types);
    const tabB = speak(ctx, ["b1", "b2", "b3"], "tab-2").then(types);
    const noId = speak(ctx, ["c1", "c2", "c3"]).then(types);
    await sleep(60);
    const fresh = await types(await speak(ctx, ["a-new"], "tab-1"));
    expect(fresh).toEqual(["audio", "done"]);
    expect(await tabA).not.toContain("done");
    expect(await tabB).toEqual(["audio", "audio", "audio", "done"]);
    expect(await noId).toEqual(["audio", "audio", "audio", "done"]);
  });

  it("an id also drops that group's queued stream but not other groups'", async () => {
    ctx = await start({ latencyMs: 120 }, undefined, { maxStreams: 1, maxQueue: 4 });
    const running = speak(ctx, ["first"], "tab-2").then(types);
    await sleep(30);
    const queuedSame = speak(ctx, ["same"], "tab-1").then(types);
    const queuedOther = speak(ctx, ["other"], "tab-3").then(types);
    await sleep(30);
    expect(await types(await speak(ctx, ["fresh"], "tab-1"))).toEqual(["audio", "done"]);
    expect(await queuedSame).toEqual([]);
    expect(await running).toEqual(["audio", "done"]);
    expect(await queuedOther).toEqual(["audio", "done"]);
    expect(ctx.engine.calls.map((c) => c.text)).toEqual(["first", "other", "fresh"]);
  });

  it("the legacy value 1 still cancels every stream, grouped or not", async () => {
    ctx = await start({ latencyMs: 150 }, undefined, { maxStreams: 3 });
    const tabA = speak(ctx, ["a1", "a2", "a3"], "tab-1").then(types);
    const noId = speak(ctx, ["c1", "c2", "c3"]).then(types);
    await sleep(60);
    expect(await types(await speak(ctx, ["new"], "1"))).toEqual(["audio", "done"]);
    expect(await tabA).not.toContain("done");
    expect(await noId).not.toContain("done");
  });

  it("a stream sent with 1 is not part of any group", async () => {
    ctx = await start({ latencyMs: 150 }, undefined, { maxStreams: 3 });
    const legacy = speak(ctx, ["l1", "l2", "l3"], "1").then(types);
    await sleep(60);
    await types(await speak(ctx, ["x"], "1"));
    await legacy;
    const again = speak(ctx, ["l1", "l2", "l3"], "1").then(types);
    await sleep(60);
    await types(await speak(ctx, ["y"], "tab-9"));
    expect(await again).toEqual(["audio", "audio", "audio", "done"]);
  });

  it.each(["a b", "x".repeat(65), "tab/1"])("rejects the malformed id %j", async (id) => {
    ctx = await start();
    const r = await raw(ctx, "POST", "/v1/speak", { Host: `127.0.0.1:${ctx.server.port}`, ...ctx.auth, "X-SpeakKit-Replace": id }, speakBody(["x"]));
    expect(r.status).toBe(400);
    expect(JSON.parse(r.body)).toEqual({
      error: { code: "invalid-request", message: "X-SpeakKit-Replace must be 1 or an id of 1 to 64 letters, digits, . _ : -" },
    });
  });
});
