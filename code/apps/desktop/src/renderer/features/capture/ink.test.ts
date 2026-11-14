import { describe, expect, it } from "vitest";
import { alphaOf, prune, type Stroke } from "./ink";

const stroke = (laser: boolean, ...ats: number[]): Stroke => ({ laser, points: ats.map((at) => ({ x: 0, y: 0, at })) });

describe("ink fade", () => {
  it("is solid for 60 % of the time, then fades to nothing", () => {
    expect([alphaOf(0, 1000), alphaOf(600, 1000), alphaOf(800, 1000), alphaOf(1000, 1000), alphaOf(5000, 1000)]).toEqual([1, 1, 0.5, 0, 0]);
  });
  it("stays until cleared when the time is 0, and ignores a clock that went back", () => {
    expect(alphaOf(999_999, 0)).toBe(1);
    expect(alphaOf(-5, 1000)).toBe(1);
  });
  it("drops faded points and empty strokes", () => {
    const strokes = [stroke(false, 0, 900), stroke(false, 0)];
    expect(prune(strokes, 1000, 1000)).toBe(2);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.points).toHaveLength(1);
    expect(prune(strokes, 5000, 1000)).toBe(1);
    expect(strokes).toEqual([]);
  });
  it("a pointer trail fades in half a second whatever the ink time is", () => {
    const strokes = [stroke(true, 0), stroke(false, 0)];
    prune(strokes, 600, 3000);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.laser).toBe(false);
  });
  it("keeps all ink when it never fades", () => {
    const strokes = [stroke(false, 0, 1)];
    expect(prune(strokes, 9e9, 0)).toBe(0);
    expect(strokes).toHaveLength(1);
  });
});
