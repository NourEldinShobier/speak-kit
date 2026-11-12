import { describe, expect, it } from "vitest";
import { cropOrFull } from "./index";

const frame = { width: 1920, height: 1080 };
const full = () => "full";
const boom = () => {
  throw new Error("boom");
};

describe("window crop", () => {
  it("crops to the window", () => {
    expect(cropOrFull(frame, { x: 100, y: 50, width: 800, height: 600 }, { crop: (r) => `${r.x},${r.y},${r.width},${r.height}`, full })).toBe("100,50,800,600");
  });
  it("falls back to the full frame without a window rectangle", () => {
    expect(cropOrFull(frame, undefined, { crop: () => "crop", full })).toBe("full");
  });
  it("falls back when the rectangle lies outside the frame, is empty or is not a number", () => {
    for (const r of [
      { x: 1500, y: 0, width: 800, height: 600 },
      { x: -10, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 0, height: 100 },
      { x: Number.NaN, y: 0, width: 100, height: 100 },
    ])
      expect(cropOrFull(frame, r, { crop: () => "crop", full })).toBe("full");
  });
  it("uses the frame as it is when the window fills it exactly (1920x1080)", () => {
    expect(cropOrFull(frame, { x: 0, y: 0, width: 1920, height: 1080 }, { crop: boom, full })).toBe("full");
  });
  it("falls back and reports when the crop throws", () => {
    const errors: unknown[] = [];
    expect(cropOrFull(frame, { x: 1, y: 1, width: 10, height: 10 }, { crop: boom, full, onError: (e) => errors.push(e) })).toBe("full");
    expect(errors).toHaveLength(1);
  });
});
