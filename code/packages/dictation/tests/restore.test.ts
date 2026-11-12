import { describe, expect, it } from "vite-plus/test";
import type { Clip } from "../src";
import { rig } from "./fakes";

const clipOf = (peak = 0.5): Clip => ({ pcm: new Float32Array(16000).fill(peak), sampleRate: 16000, peak });

describe("restore", () => {
  it("runs a recovered take through the pipeline, copies the text and keeps it in the history as recovered", async () => {
    const r = await rig();
    r.stt.state.result = { ok: true, text: "found after a crash" };
    r.dictation.restore(clipOf());
    await r.time.advance(100);
    expect(r.ins.inserted.map((i) => [i.text, i.plan])).toEqual([["Found after a crash ", { method: "copy", reason: "no-target" }]]);
    const [entry] = await r.dictation.history.list();
    expect(entry).toMatchObject({ text: "Found after a crash ", kind: "restored", outcome: "copied" });
  });

  it("tells the app a take is done when its text is saved", async () => {
    const settled: [Clip, boolean][] = [];
    const r = await rig({ keepReady: true }, undefined, { settled: (c, done) => settled.push([c, done]) });
    const clip = clipOf();
    r.dictation.restore(clip);
    await r.time.advance(100);
    expect(settled).toEqual([[clip, true]]);
  });

  it("tells the app a take is not done when the speech engine failed, so its audio is kept", async () => {
    const settled: boolean[] = [];
    const r = await rig({ keepReady: true }, undefined, { settled: (_c, done) => settled.push(done) });
    r.stt.state.result = { ok: false, code: "model-missing" };
    r.dictation.restore(clipOf());
    await r.time.advance(100);
    expect(settled).toEqual([false]);
  });

  it("counts a silent take and a take without speech as done", async () => {
    const settled: boolean[] = [];
    const r = await rig({ keepReady: true }, undefined, { settled: (_c, done) => settled.push(done) });
    r.dictation.restore(clipOf(0));
    r.stt.state.result = { ok: true, text: "" };
    r.dictation.restore(clipOf(0.5));
    await r.time.advance(100);
    expect(settled).toEqual([true, true]);
  });

  it("settles every dictation that ends, not only restored ones", async () => {
    const settled: boolean[] = [];
    const r = await rig({ keepReady: true }, undefined, { settled: (_c, done) => settled.push(done) });
    r.stt.state.result = { ok: true, text: "hello" };
    await r.hold(1000);
    await r.time.advance(2000);
    expect(settled).toEqual([true]);
  });

  it("does nothing once disposed", async () => {
    const r = await rig();
    r.dictation.dispose();
    r.dictation.restore(clipOf());
    await r.time.advance(100);
    expect(r.ins.inserted).toEqual([]);
  });

  it("a settle callback that throws does not stop the queue", async () => {
    const r = await rig({ keepReady: true }, undefined, {
      settled: () => {
        throw new Error("disk");
      },
    });
    r.stt.state.queue.push({ ok: true, text: "one" }, { ok: true, text: "two" });
    r.dictation.restore(clipOf());
    r.dictation.restore(clipOf());
    await r.time.advance(100);
    expect(r.ins.inserted).toHaveLength(2);
  });
});

describe("a cancelled take", () => {
  async function cancelled() {
    const settled: [Clip, boolean][] = [];
    const r = await rig({ keepReady: true, mode: "toggle" }, undefined, { settled: (c, done) => settled.push([c, done]) });
    r.stt.state.result = { ok: true, text: "never mind" };
    r.press();
    r.release();
    await r.time.advance(500);
    r.dictation.cancel();
    await r.time.advance(10);
    return { r, settled };
  }

  it("is not settled while it can still be undone", async () => {
    const { settled } = await cancelled();
    expect(settled).toEqual([]);
  });

  it("is settled as done when the minute for Undo runs out, so a cancel is never recovered later", async () => {
    const { r, settled } = await cancelled();
    await r.time.advance(61_000);
    expect(settled.map(([, done]) => done)).toEqual([true]);
  });

  it("is settled once, after the job, when it is undone", async () => {
    const { r, settled } = await cancelled();
    expect(r.dictation.undoCancel()).toBe(true);
    await r.time.advance(100);
    expect(settled.map(([, done]) => done)).toEqual([true]);
    await r.time.advance(61_000);
    expect(settled).toHaveLength(1);
  });
});
