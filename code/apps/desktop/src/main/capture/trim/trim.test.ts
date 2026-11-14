import { describe, expect, it } from "vitest";
import { framesIn, MIN_TRIM_MS, trimRange, wordsIn } from ".";

const f = (atMs: number) => ({ atMs, file: `f-${atMs}.jpg` });

describe("trim range", () => {
  it("keeps a valid range", () => {
    expect(trimRange(1000, 5000, 10_000)).toEqual({ startMs: 1000, endMs: 5000 });
  });
  it("cuts the end to the recording length", () => {
    expect(trimRange(1000, 20_000, 10_000)).toEqual({ startMs: 1000, endMs: 10_000 });
  });
  it("refuses less than half a second, a negative start, and fractions", () => {
    expect(trimRange(1000, 1000 + MIN_TRIM_MS - 1, 10_000)).toBeUndefined();
    expect(trimRange(-1, 5000, 10_000)).toBeUndefined();
    expect(trimRange(1000.5, 5000, 10_000)).toBeUndefined();
    expect(trimRange(9800, 12_000, 10_000)).toBeUndefined();
  });
  it("accepts exactly half a second", () => {
    expect(trimRange(0, MIN_TRIM_MS, undefined)).toEqual({ startMs: 0, endMs: 500 });
  });
});

describe("what is kept", () => {
  const range = { startMs: 2000, endMs: 5000 };
  it("keeps the words said inside the range, the start included and the end excluded", () => {
    const words = [1999, 2000, 4999, 5000].map((startMs) => ({ text: "w", startMs, endMs: startMs + 10 }));
    expect(wordsIn(words, range).map((w) => w.startMs)).toEqual([2000, 4999]);
  });
  it("chooses keyframes only from inside the range", () => {
    const frames = [0, 1000, 2000, 3000, 4000, 5000, 6000].map(f);
    expect(framesIn(frames, [], range).map((x) => x.atMs)).toEqual([2000, 3000, 4000]);
  });
  it("keeps the frame nearest the start when none is inside", () => {
    expect(framesIn([f(0), f(10_000)], [], range)).toEqual([f(0)]);
  });
  it("has no frame when there are none", () => {
    expect(framesIn([], [], range)).toEqual([]);
  });
});
