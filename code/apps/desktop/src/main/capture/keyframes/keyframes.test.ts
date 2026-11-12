import { describe, expect, it } from "vitest";
import { contactSheetPlan, fitSize, pickKeyframes, type Frame } from "./index";

const frames = (n: number, step = 1000): Frame[] => Array.from({ length: n }, (_, i) => ({ atMs: i * step, file: `f${i}.jpg` }));
const word = (text: string, startMs: number) => ({ text, startMs, endMs: startMs + 300 });

describe("pickKeyframes", () => {
  it("returns nothing without frames", () => {
    expect(pickKeyframes([], [])).toEqual({ frames: [], cues: [] });
  });
  it("keeps all frames when there are few", () => {
    expect(pickKeyframes(frames(3), []).frames.map((f) => f.file)).toEqual(["f0.jpg", "f1.jpg", "f2.jpg"]);
  });
  it("caps the count and keeps the first and last frame", () => {
    const plan = pickKeyframes(frames(100), [], 6);
    expect(plan.frames).toHaveLength(6);
    expect(plan.frames[0]!.file).toBe("f0.jpg");
    expect(plan.frames[5]!.file).toBe("f99.jpg");
  });
  it("picks the frame nearest the words 'this one'", () => {
    const plan = pickKeyframes(frames(30), [word("look", 4000), word("at", 4300), word("this", 12_400), word("one", 12_700)], 4);
    expect(plan.cues).toEqual([{ word: "this", atMs: 12_400, frame: { atMs: 12_000, file: "f12.jpg" } }]);
    expect(plan.frames.map((f) => f.atMs)).toContain(12_000);
  });
  it("does not treat 'this' without a pointing noun as a cue, but 'here' alone is one", () => {
    expect(pickKeyframes(frames(30), [word("this", 5000), word("is", 5300), word("fine", 5600)], 3).cues).toEqual([]);
    expect(pickKeyframes(frames(30), [word("Here,", 20_000)], 3).cues).toHaveLength(1);
  });
  it("never chooses the same frame twice and sorts by time", () => {
    const plan = pickKeyframes(frames(10), [word("this", 5000), word("one", 5100), word("here", 5200)], 5);
    const times = plan.frames.map((f) => f.atMs);
    expect(new Set(times).size).toBe(times.length);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
  it("sorts frames that arrive out of order", () => {
    expect(pickKeyframes([...frames(3)].reverse(), []).frames.map((f) => f.atMs)).toEqual([0, 1000, 2000]);
  });
});

describe("contactSheetPlan", () => {
  it("lays six 16:9 frames in 4 by 2 cells inside 1280 px", () => {
    const p = contactSheetPlan(6, 16 / 9);
    expect([p.columns, p.rows]).toEqual([4, 2]);
    expect(p.width).toBeLessThanOrEqual(1280);
    expect(p.height).toBeLessThanOrEqual(1280);
  });
  it("caps the cell count and survives bad aspect values", () => {
    expect(contactSheetPlan(500, 16 / 9).columns * contactSheetPlan(500, 16 / 9).rows).toBeLessThan(20);
    expect(contactSheetPlan(1, 0).cellWidth).toBeGreaterThan(0);
    expect(contactSheetPlan(0, Number.NaN).columns).toBe(2);
  });
});

describe("fitSize", () => {
  it("shrinks to the long side and never enlarges", () => {
    expect(fitSize(2560, 1440)).toEqual({ width: 1280, height: 720 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
