import { describe, expect, it } from "vite-plus/test";
import type { Narrator } from "../recording";
import { createLiveSession, createLiveTranscriber } from ".";

const RATE = 16_000;
const speech = (ms: number) => new Int16Array((ms * RATE) / 1000).fill(3000);
const quiet = (ms: number) => new Int16Array((ms * RATE) / 1000);

/** A model that answers "w1", "w2" ... and notes how long each stretch it got was. */
function model(o: { failOn?: number; ready?: boolean } = {}) {
  const got: number[] = [];
  const narrator: Narrator = {
    ready: () => o.ready ?? true,
    async transcribe(pcm) {
      got.push(Math.round((pcm.length / RATE) * 1000));
      if (got.length === o.failOn) throw new Error("model busy");
      return `w${got.length}`;
    },
  };
  return { narrator, got };
}

/** Pushes audio in half-second chunks, like the recorder does. */
function feed(t: { push(c: Int16Array): void }, pcm: Int16Array) {
  const step = RATE / 2;
  for (let at = 0; at < pcm.length; at += step) t.push(pcm.slice(at, at + step));
}
const concat = (...a: Int16Array[]) => Int16Array.from(a.flatMap((x) => [...x]));
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("live transcriber", () => {
  it("sends a stretch to the model as soon as a pause shows it is finished, before the recording ends", async () => {
    const m = model();
    const t = createLiveTranscriber({ narrator: m.narrator, log: () => undefined });
    feed(t, concat(speech(1000), quiet(2500)));
    await tick();
    expect(m.got).toEqual([1250]);
    expect(await t.finish()).toEqual([{ text: "w1", startMs: 0, endMs: 1250 }]);
    expect(m.got).toEqual([1250]);
  });

  it("waits while the person is still speaking, and sends the open stretch at the end", async () => {
    const m = model();
    const t = createLiveTranscriber({ narrator: m.narrator, log: () => undefined });
    feed(t, speech(3000));
    await tick();
    expect(m.got).toEqual([]);
    expect(await t.finish()).toEqual([{ text: "w1", startMs: 0, endMs: 3000 }]);
  });

  it("puts the words of a later stretch at their place on the recording's timeline", async () => {
    const m = model();
    const t = createLiveTranscriber({ narrator: m.narrator, log: () => undefined });
    feed(t, concat(speech(1000), quiet(2000), speech(1000)));
    expect(await t.finish()).toEqual([
      { text: "w1", startMs: 0, endMs: 1250 },
      { text: "w2", startMs: 2750, endMs: 4000 },
    ]);
    expect(m.got).toEqual([1250, 1250]);
  });

  it("skips a stretch the model fails on, logs it and keeps the others", async () => {
    const m = model({ failOn: 1 });
    const logs: string[] = [];
    const t = createLiveTranscriber({ narrator: m.narrator, log: (l) => logs.push(l) });
    feed(t, concat(speech(1000), quiet(2000), speech(1000)));
    expect(await t.finish()).toEqual([{ text: "w2", startMs: 2750, endMs: 4000 }]);
    expect(logs).toEqual(["capture narration: one stretch failed (model busy)"]);
  });

  it("cuts speech that never pauses after the longest stretch", async () => {
    const m = model();
    const t = createLiveTranscriber({ narrator: m.narrator, log: () => undefined, maxStretchMs: 2000 });
    feed(t, speech(5000));
    await t.finish();
    expect(m.got).toEqual([2000, 2000, 1000]);
  });

  it("gives null when nothing was said", async () => {
    const m = model();
    const t = createLiveTranscriber({ narrator: m.narrator, log: () => undefined });
    feed(t, quiet(3000));
    expect(await t.finish()).toBeNull();
    expect(m.got).toEqual([]);
  });
});

describe("live session", () => {
  const silent = () => undefined;
  it("makes a transcriber for a recording only when chosen and the model is ready", async () => {
    let on = false;
    const m = model();
    const s = createLiveSession({ enabled: () => on, narrator: m.narrator, log: silent });
    s.begin();
    expect(s.active()).toBe(false);
    on = true;
    s.begin();
    expect(s.active()).toBe(true);
    feed(s, speech(1000));
    expect(await s.finish()).toEqual([{ text: "w1", startMs: 0, endMs: 1000 }]);
    expect(s.active()).toBe(false);
    expect(await s.finish()).toBeNull();
    const cold = createLiveSession({ enabled: () => true, narrator: model({ ready: false }).narrator, log: silent });
    cold.begin();
    expect(cold.active()).toBe(false);
  });

  it("drops a recording that was cancelled", async () => {
    const m = model();
    const s = createLiveSession({ enabled: () => true, narrator: m.narrator, log: silent });
    s.begin();
    feed(s, speech(1000));
    s.cancel();
    expect(s.active()).toBe(false);
    expect(await s.finish()).toBeNull();
  });
});
