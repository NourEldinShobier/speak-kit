import { describe, expect, it } from "vitest";
import { contactSheetPlan, pickKeyframes, type Frame } from "./index";

const frames = (times: number[]): Frame[] => times.map((atMs) => ({ atMs, file: `f${atMs}.jpg` }));
const word = (text: string, startMs: number) => ({ text, startMs, endMs: startMs + 200 });

describe("pickKeyframes edges", () => {
  it("returns nothing when no frame may be chosen", () => {
    expect(pickKeyframes(frames([0, 1000]), [], 0)).toEqual({ frames: [], cues: [] });
  });
  it("keeps one frame when only one may be chosen", () => {
    expect(pickKeyframes(frames([0, 1000, 2000]), [], 1).frames).toEqual(frames([0]));
  });
  it("sorts frames given out of order", () => {
    expect(pickKeyframes(frames([3000, 0, 2000, 1000]), [], 4).frames.map((f) => f.atMs)).toEqual([0, 1000, 2000, 3000]);
  });
  it("spreads the filling frames evenly between the first and the last", () => {
    expect(pickKeyframes(frames(Array.from({ length: 21 }, (_, i) => i * 1000)), [], 5).frames.map((f) => f.atMs)).toEqual([0, 5000, 10_000, 15_000, 20_000]);
  });
  it("takes the earlier frame when two are equally near a cue", () => {
    const plan = pickKeyframes(frames([0, 1000, 2000, 3000]), [word("here", 1500)], 2);
    expect(plan.cues[0]!.frame.atMs).toBe(1000);
  });
  it("matches a pointing word only as a whole word", () => {
    expect(pickKeyframes(frames([0, 1000, 2000]), [word("there's", 1000)], 3).cues).toEqual([]);
    expect(pickKeyframes(frames([0, 1000, 2000]), [word("nowhere", 1000)], 3).cues).toEqual([]);
    expect(pickKeyframes(frames([0, 1000, 2000]), [word("this", 1000), word("button's", 1200)], 3).cues).toEqual([]);
    expect(pickKeyframes(frames([0, 1000, 2000]), [word("this", 1000), word("rowing", 1200)], 3).cues).toEqual([]);
    expect(pickKeyframes(frames([0, 1000, 2000]), [word("this", 1000), word("Menu.", 1200)], 3).cues).toHaveLength(1);
  });
  it("does not choose more frames than the cap even when every word points", () => {
    const words = [word("here", 0), word("there", 1000), word("here", 2000), word("there", 3000)];
    expect(pickKeyframes(frames([0, 1000, 2000, 3000, 4000]), words, 2).frames).toHaveLength(2);
  });
});

describe("contactSheetPlan edges", () => {
  it("lays out a single frame as one row inside the limit", () => {
    expect(contactSheetPlan(1, 16 / 9, 1280)).toEqual({ columns: 2, rows: 1, cellWidth: 640, cellHeight: 360, width: 1280, height: 360 });
  });
  it("keeps a tall screen's aspect and fits the limit", () => {
    expect(contactSheetPlan(4, 0.5, 1000)).toEqual({ columns: 2, rows: 2, cellWidth: 250, cellHeight: 500, width: 500, height: 1000 });
  });
  it("uses 16:9 for an aspect that is zero, negative or not a number", () => {
    const wide = contactSheetPlan(4, 16 / 9, 1280);
    expect(contactSheetPlan(4, 0, 1280)).toEqual(wide);
    expect(contactSheetPlan(4, -1, 1280)).toEqual(wide);
    expect(contactSheetPlan(4, Number.NaN, 1280)).toEqual(wide);
  });
  it("never plans more than 12 cells", () => {
    expect(contactSheetPlan(50, 16 / 9, 1280)).toEqual(contactSheetPlan(12, 16 / 9, 1280));
  });
});
