import { describe, expect, it } from "vite-plus/test";
import { Timeline, blockJump, nearestSentence } from "./timeline";

const s = (...blocks: number[]) => blocks.map((block) => ({ block }));

describe("Timeline", () => {
  it("estimates 15 chars per second at speed 1 until a duration is measured", () => {
    const speed = { v: 1 };
    const t = new Timeline(() => speed.v);
    t.reset([{ text: "a".repeat(30) }, { text: "b".repeat(15) }]);
    expect([t.durationMs(0), t.startMs(1), t.totalMs()]).toEqual([2000, 2000, 3000]);
    speed.v = 2;
    expect(t.totalMs()).toBe(1500);
  });

  it("uses measured durations and forgets them from a given sentence on", () => {
    const t = new Timeline(() => 1);
    t.reset([{ text: "a".repeat(15) }, { text: "b".repeat(15) }, { text: "c".repeat(15) }]);
    t.set(0, 400);
    t.set(2, 700);
    expect(t.totalMs()).toBe(2100);
    t.forget(1);
    expect([t.durationMs(0), t.durationMs(2)]).toEqual([400, 1000]);
  });
});

describe("nearestSentence", () => {
  it("picks the sentence starting closest to the target, clamped to the document", () => {
    const d = () => 1000;
    expect(nearestSentence(5, d, 2400)).toBe(2);
    expect(nearestSentence(5, d, 2600)).toBe(3);
    expect(nearestSentence(5, d, -5000)).toBe(0);
    expect(nearestSentence(5, d, 99000)).toBe(4);
  });
});

describe("blockJump", () => {
  const doc = s(0, 0, 1, 1, 1, 2);
  it("goes to the first sentence of the next paragraph, nowhere from the last", () => {
    expect(blockJump(doc, 0, 1)).toBe(2);
    expect(blockJump(doc, 3, 1)).toBe(5);
    expect(blockJump(doc, 5, 1)).toBeUndefined();
  });
  it("goes to the first sentence of the previous paragraph, or the start", () => {
    expect(blockJump(doc, 5, -1)).toBe(2);
    expect(blockJump(doc, 4, -1)).toBe(0);
    expect(blockJump(doc, 1, -1)).toBe(0);
  });
});
