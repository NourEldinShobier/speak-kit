import { describe, expect, it } from "vitest";
import { correctLag, digitalSilence, findSegments, wordsOf } from "./index";

const RATE = 1000;
/** A track: [ms, amplitude] runs, 1 sample per ms. */
const track = (...runs: [number, number][]) => Int16Array.from(runs.flatMap(([ms, amp]) => Array.from({ length: ms }, () => amp)));

describe("findSegments", () => {
  it("finds one stretch with padding", () => {
    const segs = findSegments(track([1000, 0], [1000, 8000], [1000, 0]), { rate: RATE });
    expect(segs).toEqual([{ startMs: 750, endMs: 2250 }]);
  });
  it("keeps very quiet speech", () => {
    // amplitude 60 of 32768 is about -55 dB
    expect(findSegments(track([500, 0], [800, 60], [500, 0]), { rate: RATE })).toHaveLength(1);
  });
  it("leaves out digital silence and returns nothing for an empty or silent track", () => {
    expect(findSegments(new Int16Array(0), { rate: RATE })).toEqual([]);
    expect(findSegments(track([3000, 0]), { rate: RATE })).toEqual([]);
  });
  it("merges stretches that are close and splits those that are far apart", () => {
    const close = findSegments(track([500, 5000], [400, 0], [500, 5000]), { rate: RATE, padMs: 0 });
    expect(close).toEqual([{ startMs: 0, endMs: 1400 }]);
    const far = findSegments(track([500, 5000], [2000, 0], [500, 5000]), { rate: RATE, padMs: 0 });
    expect(far).toEqual([
      { startMs: 0, endMs: 500 },
      { startMs: 2500, endMs: 3000 },
    ]);
  });
  it("drops a click shorter than the minimum", () => {
    expect(findSegments(track([1000, 0], [50, 20000], [1000, 0]), { rate: RATE })).toEqual([]);
  });
  it("clamps the padding to the track", () => {
    expect(findSegments(track([300, 5000]), { rate: RATE })).toEqual([{ startMs: 0, endMs: 300 }]);
  });
});

describe("digitalSilence", () => {
  it("is true only when the last stretch is all zeros", () => {
    expect(digitalSilence(track([500, 3000], [2000, 0]), RATE, 1500)).toBe(true);
    expect(digitalSilence(track([2000, 0], [500, 3000]), RATE, 1500)).toBe(false);
  });
  it("is false for a track shorter than the window", () => {
    expect(digitalSilence(track([100, 0]), RATE, 1500)).toBe(false);
  });
  it("treats a one-step dither as silence but a real noise floor as sound", () => {
    expect(digitalSilence(track([1000, 1]), RATE, 1000)).toBe(true);
    expect(digitalSilence(track([1000, 12]), RATE, 1000)).toBe(false);
  });
});

describe("wordsOf", () => {
  it("spreads words over the stretch and ends exactly at its end", () => {
    const w = wordsOf("hello big world", { startMs: 1000, endMs: 2300 });
    expect(w.map((x) => x.text)).toEqual(["hello", "big", "world"]);
    expect(w[0]!.startMs).toBe(1000);
    expect(w[2]!.endMs).toBe(2300);
    expect(w[0]!.endMs).toBe(w[1]!.startMs);
  });
  it("returns no words for blank text", () => {
    expect(wordsOf("   ", { startMs: 0, endMs: 100 })).toEqual([]);
  });
  it("gives a single word the whole stretch", () => {
    expect(wordsOf("hi", { startMs: 5, endMs: 9 })).toEqual([{ text: "hi", startMs: 5, endMs: 9 }]);
  });
});

describe("correctLag", () => {
  it("moves words earlier and never below zero", () => {
    expect(correctLag([{ text: "a", startMs: 100, endMs: 400 }], 250)).toEqual([{ text: "a", startMs: 0, endMs: 150 }]);
  });
});
