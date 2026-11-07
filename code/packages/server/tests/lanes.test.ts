import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ExportJob } from "@speakkit/protocol";
import { StreamQueue, type Stream } from "../src/stream-queue";
import { readFrames, speakBody, start, type Ctx } from "./harness";

const tick = () => new Promise((r) => setTimeout(r, 10));
const stream = (): Stream => ({ ac: new AbortController() });

describe("StreamQueue lanes", () => {
  it("background work never takes the last slot, interactive work may", async () => {
    const q = new StreamQueue(2, 8);
    const b1 = await q.acquire(stream(), "background");
    let b2: (() => void) | undefined;
    void q.acquire(stream(), "background").then((r) => (b2 = r));
    await tick();
    expect(b2).toBeUndefined();
    const i1 = await q.acquire(stream());
    i1();
    await tick();
    expect(b2).toBeUndefined(); // the freed slot is still reserved
    b1();
    await tick();
    expect(b2).toBeDefined();
  });

  it("an interactive waiter is served before an earlier background waiter", async () => {
    const q = new StreamQueue(2, 8);
    const i1 = await q.acquire(stream());
    const i2 = await q.acquire(stream());
    const order: string[] = [];
    void q.acquire(stream(), "background").then(() => order.push("background"));
    void q.acquire(stream()).then(() => order.push("interactive"));
    await tick();
    i1();
    await tick();
    expect(order).toEqual(["interactive"]);
    i2();
    await tick();
    expect(order).toEqual(["interactive", "background"]);
  });

  it("with a single slot background work uses it", async () => {
    const q = new StreamQueue(1, 8);
    const b = await q.acquire(stream(), "background");
    let i: (() => void) | undefined;
    void q.acquire(stream()).then((r) => (i = r));
    await tick();
    expect(i).toBeUndefined();
    b();
    await tick();
    expect(i).toBeDefined();
  });

  it("releasing twice gives back one slot", async () => {
    const q = new StreamQueue(1, 8);
    const a = await q.acquire(stream());
    a();
    a();
    const b = await q.acquire(stream());
    let c = false;
    void q.acquire(stream()).then(() => (c = true));
    await tick();
    expect(c).toBe(false);
    b();
  });

  it("a queued waiter that is aborted leaves the queue", async () => {
    const q = new StreamQueue(1, 8);
    const a = await q.acquire(stream());
    const s = stream();
    const waiting = q.acquire(s).then(
      () => "got",
      () => "dropped",
    );
    s.ac.abort(new Error("gone"));
    s.dequeue?.();
    expect(await waiting).toBe("dropped");
    a();
  });
});

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});

describe("exports and reading share the slots", () => {
  it("a read starts at once while exports hold slots, because one slot is kept for reading", async () => {
    ctx = await start({ latencyMs: 250 }); // two slots by default
    const headers = { ...ctx.auth, "Content-Type": "application/json" };
    const exportSentence = (text: string) =>
      fetch(`${ctx!.base}/v1/export`, { method: "POST", headers, body: JSON.stringify({ sentences: [text], voice: "af_heart", speed: 1 }) }).then((r) => r.json() as Promise<ExportJob>);
    await exportSentence("e1");
    await exportSentence("e2");
    await new Promise((r) => setTimeout(r, 60));
    const frames = await readFrames(await fetch(`${ctx.base}/v1/speak`, { method: "POST", headers, body: speakBody(["read"]) }));
    expect(frames.map((f) => f.frame.header.type)).toEqual(["audio", "done"]);
    // the read began before e2: e2 waited for e1 instead of taking the second slot
    expect(ctx.engine.calls.map((c) => c.text).slice(0, 2)).toEqual(["e1", "read"]);
  });
});
