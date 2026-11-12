import { describe, expect, it } from "vite-plus/test";
import { coversDisplay } from "./pause-watch";

type Rect = { x: number; y: number; width: number; height: number };
/** A display of 1280x720 DIPs at 150% scaling: 1920x1080 physical pixels. */
const scaled = (factor: number) => ({
  screenToDipRect: (_: null, r: Rect): Rect => ({ x: r.x / factor, y: r.y / factor, width: r.width / factor, height: r.height / factor }),
  getDisplayMatching: () => ({ bounds: { x: 0, y: 0, width: 1280, height: 720 } }),
});

describe("full-screen detection", () => {
  it("does not treat a maximized window as full screen at 150% scaling", () => {
    expect(coversDisplay({ x: 0, y: 0, width: 1920, height: 1040 }, scaled(1.5))).toBe(false);
  });

  it("recognizes a window covering the whole scaled display", () => {
    expect(coversDisplay({ x: 0, y: 0, width: 1920, height: 1080 }, scaled(1.5))).toBe(true);
  });

  it("works at 100% scaling", () => {
    const api = { ...scaled(1), getDisplayMatching: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }) };
    expect(coversDisplay({ x: 0, y: 0, width: 1920, height: 1080 }, api)).toBe(true);
    expect(coversDisplay({ x: 0, y: 30, width: 1920, height: 1050 }, api)).toBe(false);
  });
});
