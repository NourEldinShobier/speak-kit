import { describe, expect, it } from "vitest";
import { correctLag, findSegments, wordsOf } from "./index";

const RATE = 1000;
const track = (...runs: [number, number][]) => Int16Array.from(runs.flatMap(([ms, amp]) => Array.from({ length: ms }, () => amp)));
const bare = { rate: RATE, padMs: 0 };

describe("findSegments edges", () => {
  it("keeps a stretch of exactly the minimum length and drops one block shorter", () => {
    expect(findSegments(track([100, 0], [150, 5000], [100, 0]), { ...bare, minMs: 150 })).toEqual([{ startMs: 100, endMs: 250 }]);
    expect(findSegments(track([100, 0], [100, 5000], [100, 0]), { ...bare, minMs: 150 })).toEqual([]);
  });
  it("merges stretches whose gap is exactly the merge gap and splits those one block further apart", () => {
    expect(findSegments(track([500, 5000], [700, 0], [500, 5000]), bare)).toEqual([{ startMs: 0, endMs: 1700 }]);
    expect(findSegments(track([500, 5000], [750, 0], [500, 5000]), bare)).toEqual([
      { startMs: 0, endMs: 500 },
      { startMs: 1250, endMs: 1750 },
    ]);
  });
  it("counts a block as sound exactly at the floor and not below it", () => {
    // 27 / 32768 is just above 0.0008, 25 / 32768 just below
    expect(findSegments(track([500, 27]), bare)).toEqual([{ startMs: 0, endMs: 500 }]);
    expect(findSegments(track([500, 25]), bare)).toEqual([]);
  });
  it("ends a stretch that runs to the end of the track at the end of the track", () => {
    expect(findSegments(track([200, 0], [425, 5000]), bare)).toEqual([{ startMs: 200, endMs: 625 }]);
  });
  it("measures the blocks in the track's own sample rate", () => {
    const rate = 16_000;
    const pcm = track([16_000, 0], [8000, 5000], [16_000, 0]);
    expect(findSegments(pcm, { rate, padMs: 0 })).toEqual([{ startMs: 1000, endMs: 1500 }]);
  });
  it("pads each stretch but not beyond the track", () => {
    expect(findSegments(track([100, 5000], [1000, 0], [300, 5000]), { rate: RATE, padMs: 250, mergeGapMs: 10, minMs: 50 })).toEqual([
      { startMs: 0, endMs: 350 },
      { startMs: 850, endMs: 1400 },
    ]);
  });
});

describe("wordsOf edges", () => {
  it("spreads the words over the stretch by their length and ends the last word with the stretch", () => {
    expect(wordsOf("a bcd", { startMs: 0, endMs: 400 })).toEqual([
      { text: "a", startMs: 0, endMs: 100 },
      { text: "bcd", startMs: 100, endMs: 400 },
    ]);
  });
  it("starts at the start of the stretch, not at zero", () => {
    expect(wordsOf("ab", { startMs: 1000, endMs: 1500 })).toEqual([{ text: "ab", startMs: 1000, endMs: 1500 }]);
  });
  it("gives every word the same share when they are the same length", () => {
    expect(wordsOf("aa bb cc", { startMs: 0, endMs: 300 }).map((w) => [w.startMs, w.endMs])).toEqual([
      [0, 100],
      [100, 200],
      [200, 300],
    ]);
  });
  it("returns nothing for empty or blank text, and splits on any whitespace", () => {
    expect(wordsOf("", { startMs: 0, endMs: 100 })).toEqual([]);
    expect(wordsOf(" \n\t ", { startMs: 0, endMs: 100 })).toEqual([]);
    expect(wordsOf("a\tb\nc", { startMs: 0, endMs: 300 }).map((w) => w.text)).toEqual(["a", "b", "c"]);
  });
  it("gives zero-length words to a stretch that ends before it starts", () => {
    expect(wordsOf("ab cd", { startMs: 500, endMs: 100 })).toEqual([
      { text: "ab", startMs: 500, endMs: 500 },
      { text: "cd", startMs: 500, endMs: 100 },
    ]);
  });
  it("rounds times to whole milliseconds", () => {
    expect(wordsOf("a bb ccc", { startMs: 0, endMs: 100 }).map((w) => [w.startMs, w.endMs])).toEqual([
      [0, 17],
      [17, 50],
      [50, 100],
    ]);
  });
});

describe("correctLag edges", () => {
  it("moves both times earlier and never below zero", () => {
    expect(correctLag([{ text: "a", startMs: 50, endMs: 300 }], 120)).toEqual([{ text: "a", startMs: 0, endMs: 180 }]);
    expect(correctLag([{ text: "a", startMs: 10, endMs: 20 }], 120)).toEqual([{ text: "a", startMs: 0, endMs: 0 }]);
    expect(correctLag([], 120)).toEqual([]);
  });
});
