import { describe, expect, it } from "vite-plus/test";
import { blackness, fitJpeg, planCapture, sendSize, type Bitmap, type DisplayInfo, type WindowInfo } from "./plan";

const main: DisplayInfo = { id: "1", bounds: { x: 0, y: 0, width: 2560, height: 1600 } };
const second: DisplayInfo = { id: "2", bounds: { x: 2560, y: 0, width: 1920, height: 1080 } };
const win = (id: string, name: string, x: number, y: number, width: number, height: number): WindowInfo => ({ id, name, rect: { x, y, width, height } });

describe("planCapture, screen scope", () => {
  it("takes the display under the cursor, whole", () => {
    expect(planCapture({ scope: "screen", displays: [main, second], cursor: { x: 3000, y: 500 }, windows: [] })).toEqual({ ok: true, display: second, crop: undefined, target: "screen" });
  });

  it("falls back to the first display when the cursor is on none", () => {
    expect(planCapture({ scope: "screen", displays: [main, second], cursor: { x: -50, y: 9000 }, windows: [] })).toMatchObject({ ok: true, display: main });
  });

  it("fails when no display is known", () => {
    expect(planCapture({ scope: "screen", displays: [], cursor: { x: 0, y: 0 }, windows: [] })).toEqual({ ok: false, code: "capture-failed" });
  });
});

describe("planCapture, window scope", () => {
  const base = { scope: "window", displays: [main, second], cursor: { x: 0, y: 0 } } as const;

  it("takes the topmost window and cuts it out of its display", () => {
    const r = planCapture({ ...base, windows: [win("window:10:0", "Docs - Browser", 100, 50, 1200, 900), win("window:11:0", "Editor", 0, 0, 800, 600)] });
    expect(r).toEqual({ ok: true, display: main, crop: { x: 100, y: 50, width: 1200, height: 900 }, target: "Docs - Browser" });
  });

  it("prefers the foreground window to the topmost one", () => {
    const r = planCapture({ ...base, foreground: "window:11", windows: [win("window:10:0", "Overlay clock", 0, 0, 400, 300), win("window:11:0", "Editor", 10, 20, 800, 600)] });
    expect(r).toMatchObject({ ok: true, target: "Editor", crop: { x: 10, y: 20, width: 800, height: 600 } });
  });

  it("does not take window 110 for the foreground window 11", () => {
    const r = planCapture({ ...base, foreground: "window:11", windows: [win("window:110:0", "Other", 0, 0, 400, 300)] });
    expect(r).toMatchObject({ target: "Other" });
  });

  it("skips windows without a title, without a position and the tiny ones", () => {
    const r = planCapture({
      ...base,
      windows: [win("window:1:0", "", 0, 0, 900, 900), { id: "window:2:0", name: "Ghost", rect: undefined }, win("window:3:0", "Tool strip", 0, 0, 900, 40), win("window:4:0", "Real", 0, 0, 900, 700)],
    });
    expect(r).toMatchObject({ target: "Real" });
  });

  it("chooses the display that holds most of the window and clips the rest", () => {
    const r = planCapture({ ...base, windows: [win("window:5:0", "Straddler", 2400, 100, 1000, 500)] });
    expect(r).toEqual({ ok: true, display: second, crop: { x: 0, y: 100, width: 840, height: 500 }, target: "Straddler" });
  });

  it("ignores a window that is on no display", () => {
    expect(planCapture({ ...base, windows: [win("window:6:0", "Gone", 9000, 9000, 500, 500)] })).toEqual({ ok: false, code: "no-window" });
  });

  it("says no-window when there is nothing to look at", () => {
    expect(planCapture({ ...base, windows: [] })).toEqual({ ok: false, code: "no-window" });
  });

  it("shortens a very long title", () => {
    const r = planCapture({ ...base, windows: [win("window:7:0", `  ${"x".repeat(300)}  `, 0, 0, 500, 500)] });
    expect(r.ok && r.target).toHaveLength(120);
  });
});

describe("sendSize", () => {
  it.each([
    [2560, 1600, 1280, 800],
    [1920, 1080, 1280, 720],
    [700, 400, 700, 400],
    [800, 2400, 427, 1280],
    [1280, 720, 1280, 720],
  ])("%ix%i is sent at %ix%i", (w, h, ew, eh) => {
    expect(sendSize(w, h)).toEqual({ width: ew, height: eh });
  });
});

describe("fitJpeg", () => {
  it("takes the first step when it fits", () => {
    const calls: number[][] = [];
    const r = fitJpeg({ width: 1280, height: 800 }, (w, h, q) => (calls.push([w, h, q]), new Uint8Array(100_000)));
    expect(calls).toEqual([[1280, 800, 80]]);
    expect(r).toMatchObject({ width: 1280, height: 800 });
  });

  it("lowers quality, then size, until the picture is at most 190000 bytes", () => {
    const calls: number[][] = [];
    const sizes: Record<number, number> = { 80: 300_000, 65: 250_000, 50: 200_000 };
    const r = fitJpeg({ width: 1280, height: 800 }, (w, h, q) => (calls.push([w, h, q]), new Uint8Array(w === 1280 ? sizes[q]! : 150_000)));
    expect(calls).toEqual([
      [1280, 800, 80],
      [1280, 800, 65],
      [1280, 800, 50],
      [960, 600, 60],
    ]);
    expect(r).toMatchObject({ width: 960, height: 600 });
    expect(r?.jpeg.length).toBe(150_000);
  });

  it("accepts exactly the limit and refuses one byte more", () => {
    expect(fitJpeg({ width: 100, height: 100 }, () => new Uint8Array(190_000))).toBeDefined();
    expect(fitJpeg({ width: 100, height: 100 }, () => new Uint8Array(190_001))).toBeUndefined();
  });
});

/** A picture of `w` x `h` pixels where `paint(x, y)` gives the grey level (0 to 255). */
const picture = (w: number, h: number, paint: (x: number, y: number) => number): Bitmap => {
  const bgra = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = paint(x, y);
      bgra.set([v, v, v, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, bgra };
};

describe("blackness", () => {
  it("is black when nothing is lit", () => {
    expect(blackness(picture(64, 36, () => 0))).toBe("black");
  });

  it("is black with a few stray pixels (under 1 percent)", () => {
    expect(blackness(picture(64, 36, (x, y) => (x === 3 && y < 20 ? 200 : 0)))).toBe("black");
  });

  it("is partly black with a big black rectangle in a drawn window", () => {
    expect(blackness(picture(64, 36, (x, y) => (x >= 10 && x < 50 && y >= 8 && y < 28 ? 0 : 230)))).toBe("partly");
  });

  it("is nothing special for a dark theme (grey, not black) and for a light page", () => {
    expect(blackness(picture(64, 36, () => 30))).toBeUndefined();
    expect(blackness(picture(64, 36, () => 245))).toBeUndefined();
  });

  it("is nothing special when the black pixels are scattered text on a black page below the area bar", () => {
    expect(blackness(picture(64, 36, (x, y) => ((x + y) % 2 === 0 ? 0 : 255)))).toBeUndefined();
  });

  it("ignores a small black block", () => {
    expect(blackness(picture(64, 36, (x, y) => (x < 10 && y < 10 ? 0 : 200)))).toBeUndefined();
  });

  it("copes with an empty picture", () => {
    expect(blackness({ width: 0, height: 0, bgra: new Uint8Array() })).toBeUndefined();
  });
});
