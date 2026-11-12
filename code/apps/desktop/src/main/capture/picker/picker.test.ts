import { describe, expect, it } from "vitest";
import { areaBetween, describeDisplay, displayAt, remember, startMode, toDisplayPixels, windowAt, type DisplayGeometry } from "./index";

const left: DisplayGeometry = { id: "1", name: "Display 1", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
const right: DisplayGeometry = { id: "2", name: "Display 2", bounds: { x: 1920, y: 0, width: 1707, height: 960 }, scaleFactor: 1.5 };

describe("picker geometry", () => {
  it("finds the display under a point, including the seam", () => {
    expect(displayAt({ x: 1919, y: 10 }, [left, right])?.id).toBe("1");
    expect(displayAt({ x: 1920, y: 10 }, [left, right])?.id).toBe("2");
    expect(displayAt({ x: -5, y: 10 }, [left, right])).toBeUndefined();
  });
  it("picks the topmost window under the pointer", () => {
    const windows = [
      { id: "top", title: "Top", rect: { x: 100, y: 100, width: 200, height: 200 } },
      { id: "back", title: "Back", rect: { x: 0, y: 0, width: 1000, height: 800 } },
    ];
    expect(windowAt({ x: 150, y: 150 }, windows)?.id).toBe("top");
    expect(windowAt({ x: 500, y: 500 }, windows)?.id).toBe("back");
    expect(windowAt({ x: 1500, y: 500 }, windows)).toBeUndefined();
  });
  it("makes an area from two corners in any direction", () => {
    expect(areaBetween({ x: 300, y: 400 }, { x: 100, y: 100 }, left)).toEqual({ x: 100, y: 100, width: 200, height: 300 });
  });
  it("refuses an area under 36 by 36 pixels and accepts exactly 36", () => {
    expect(areaBetween({ x: 10, y: 10 }, { x: 45, y: 200 }, left)).toBeUndefined();
    expect(areaBetween({ x: 10, y: 10 }, { x: 46, y: 46 }, left)).toEqual({ x: 10, y: 10, width: 36, height: 36 });
  });
  it("keeps an area inside its display", () => {
    expect(areaBetween({ x: 1800, y: 900 }, { x: 2400, y: 1200 }, left)).toEqual({ x: 1800, y: 900, width: 120, height: 180 });
  });
  it("converts to the pixels of the display it is on: each display uses its own scale", () => {
    expect(toDisplayPixels({ x: 1920 + 100, y: 40, width: 300, height: 200 }, right)).toEqual({ x: 150, y: 60, width: 450, height: 300 });
    expect(toDisplayPixels({ x: 100, y: 40, width: 300, height: 200 }, left)).toEqual({ x: 100, y: 40, width: 300, height: 200 });
  });
  it("rounds at fractional scales", () => {
    const d: DisplayGeometry = { ...left, scaleFactor: 1.25 };
    expect(toDisplayPixels({ x: 3, y: 3, width: 101, height: 33 }, d)).toEqual({ x: 4, y: 4, width: 126, height: 41 });
  });
  it("names a display with its resolution and scale", () => {
    expect(describeDisplay(right)).toBe("Display 2 · 2561 × 1440 · 150%");
  });
  it("starts in the last mode used on that display, else the whole screen", () => {
    const last = remember({}, "2", "area");
    expect(startMode(last, "2")).toBe("area");
    expect(startMode(last, "1")).toBe("screen");
    expect(last).toEqual({ "2": "area" });
  });
});
