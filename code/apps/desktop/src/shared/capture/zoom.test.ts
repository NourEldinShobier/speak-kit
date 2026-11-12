import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { addSample, autoRegions, cropAt, cropOfRegion, fractionIn, inPixels, normalizeRegions, ZOOM, ZoomRegionsSchema, zoomCells, type PointerSample, type ZoomRegion } from "./zoom";

const region = (startMs: number, endMs: number, o: Partial<ZoomRegion> = {}): ZoomRegion => ({ startMs, endMs, x: 0.5, y: 0.5, scale: 2, ...o });
const still = (from: number, to: number, x: number, y: number): PointerSample[] => Array.from({ length: (to - from) / 200 + 1 }, (_, i) => ({ atMs: from + i * 200, x, y }));

describe("normalizeRegions", () => {
  it("cuts regions to the recording, orders them and lets a later one start where the earlier ends", () => {
    expect(normalizeRegions([region(2000, 6000), region(0, 3000)], 5000)).toEqual([region(0, 3000), region(3000, 5000)]);
  });
  it("drops a region shorter than a second, also one that is left short by an overlap", () => {
    expect(normalizeRegions([region(0, 999)], 9000)).toEqual([]);
    expect(normalizeRegions([region(0, 3000), region(2500, 3400)], 9000)).toEqual([region(0, 3000)]);
    expect(normalizeRegions([region(0, 1000)], 9000)).toEqual([region(0, 1000)]);
  });
  it("keeps the point inside the picture and the scale between 1.25 and 4", () => {
    expect(normalizeRegions([region(0, 2000, { x: -1, y: 3, scale: 10 })], 9000)).toEqual([region(0, 2000, { x: 0, y: 1, scale: 4 })]);
    expect(normalizeRegions([region(0, 2000, { scale: 1 })], 9000)).toEqual([region(0, 2000, { scale: 1.25 })]);
  });
  it("keeps at most 50 regions", () => {
    const many = Array.from({ length: 60 }, (_, i) => region(i * 1000, i * 1000 + 1000));
    expect(normalizeRegions(many, 60_000).length).toBe(ZOOM.maxRegions);
  });
});

describe("cropOfRegion", () => {
  it("shows 1 / scale of each side around the point", () => {
    expect(cropOfRegion(region(0, 1, { x: 0.5, y: 0.5, scale: 2 }))).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  });
  it("slides back inside the picture at an edge", () => {
    expect(cropOfRegion(region(0, 1, { x: 0.95, y: 0.02, scale: 2 }))).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
    expect(cropOfRegion(region(0, 1, { x: 0, y: 1, scale: 4 }))).toEqual({ x: 0, y: 0.75, width: 0.25, height: 0.25 });
  });
});

describe("cropAt", () => {
  const regions = [region(1000, 5000)];
  const full = { x: 0, y: 0, width: 1, height: 1 };
  it("shows the whole picture outside a region and the crop inside it", () => {
    expect(cropAt(regions, 0)).toEqual(full);
    expect(cropAt(regions, 5001)).toEqual(full);
    expect(cropAt(regions, 3000)).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(cropAt([], 3000)).toEqual(full);
  });
  it("glides in and out over 300 ms", () => {
    expect(cropAt(regions, 1000)).toEqual(full);
    expect(cropAt(regions, 1150)).toEqual({ x: 0.125, y: 0.125, width: 0.75, height: 0.75 });
    expect(cropAt(regions, 1300)).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(cropAt(regions, 4850)).toEqual({ x: 0.125, y: 0.125, width: 0.75, height: 0.75 });
    expect(cropAt(regions, 5000)).toEqual(full);
  });
  it("turns fractions into pixels", () => {
    expect(inPixels({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 1920, 1080)).toEqual({ x: 480, y: 270, width: 960, height: 540 });
  });
});

describe("autoRegions", () => {
  it("zooms where the pointer rests, and holds a little after it moves on", () => {
    const samples = [...still(0, 1000, 0.5, 0.5), { atMs: 1200, x: 0.9, y: 0.1 }, { atMs: 1400, x: 0.1, y: 0.9 }];
    expect(autoRegions(samples, [], 10_000)).toEqual([region(0, 1800)]);
  });
  it("does not zoom for a pointer that rests less than 0.8 seconds or keeps moving", () => {
    expect(autoRegions(still(0, 600, 0.5, 0.5), [], 10_000)).toEqual([]);
    const moving = Array.from({ length: 20 }, (_, i) => ({ atMs: i * 200, x: i * 0.05, y: 0.5 }));
    expect(autoRegions(moving, [], 10_000)).toEqual([]);
  });
  it("zooms where a stroke started, at the pointer of that moment", () => {
    const samples = [...still(0, 1000, 0.5, 0.5), { atMs: 4000, x: 0.2, y: 0.7 }];
    expect(autoRegions(samples, [4000], 10_000)).toEqual([region(0, 1800), region(4000, 6000, { x: 0.2, y: 0.7 })]);
  });
  it("lets a stroke zoom start after the rest zoom it overlaps, and ignores a stroke with no pointer samples", () => {
    expect(autoRegions(still(0, 1000, 0.5, 0.5), [1000], 10_000)).toEqual([region(0, 1800), region(1800, 3000)]);
    expect(autoRegions([], [1000], 10_000)).toEqual([]);
  });
  it("holds a long rest for at most five seconds", () => {
    expect(autoRegions(still(0, 10_000, 0.5, 0.5), [], 20_000)).toEqual([region(0, 5000)]);
  });
});

describe("pointer samples", () => {
  it("keeps one sample per 200 ms and stops at the cap", () => {
    const s: PointerSample[] = [];
    for (const at of [0, 100, 199, 200, 350, 400]) addSample(s, { atMs: at, x: 0, y: 0 });
    expect(s.map((p) => p.atMs)).toEqual([0, 200, 400]);
    const full: PointerSample[] = Array.from({ length: ZOOM.maxSamples }, (_, i) => ({ atMs: i * 200, x: 0, y: 0 }));
    addSample(full, { atMs: ZOOM.maxSamples * 200, x: 0, y: 0 });
    expect(full.length).toBe(ZOOM.maxSamples);
  });
  it("finds where a desktop point falls in the recorded rectangle", () => {
    const rect = { x: 100, y: 50, width: 200, height: 100 };
    expect(fractionIn(rect, { x: 200, y: 100 })).toEqual({ x: 0.5, y: 0.5 });
    expect(fractionIn(rect, { x: 100, y: 150 })).toEqual({ x: 0, y: 1 });
    expect(fractionIn(rect, { x: 99, y: 100 })).toBeUndefined();
    expect(fractionIn(rect, { x: 200, y: 151 })).toBeUndefined();
    expect(fractionIn({ x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0 })).toBeUndefined();
  });
});

describe("zoomCells", () => {
  const frames = [0, 1000, 2000, 3000].map((atMs) => ({ atMs, file: `f${atMs}` }));
  it("takes the frame nearest the middle of each region with the part the region shows", () => {
    expect(zoomCells([region(1500, 3300, { x: 0.95, y: 0.5 })], frames)).toEqual([{ frame: frames[2], crop: { x: 0.5, y: 0.25, width: 0.5, height: 0.5 } }]);
    expect(zoomCells([region(0, 1000), region(2800, 3600)], frames).map((c) => c.frame.file)).toEqual(["f0", "f3000"]);
  });
  it("gives nothing without frames", () => {
    expect(zoomCells([region(0, 1000)], [])).toEqual([]);
  });
});

describe("region schema", () => {
  it("accepts regions in range and refuses the rest", () => {
    expect(v.safeParse(ZoomRegionsSchema, [region(0, 2000)]).success).toBe(true);
    expect(v.safeParse(ZoomRegionsSchema, [region(0, 2000, { scale: 5 })]).success).toBe(false);
    expect(v.safeParse(ZoomRegionsSchema, [region(0, 2000, { x: 1.1 })]).success).toBe(false);
    expect(v.safeParse(ZoomRegionsSchema, [region(0.5, 2000)]).success).toBe(false);
    expect(v.safeParse(ZoomRegionsSchema, Array.from({ length: 51 }, () => region(0, 2000))).success).toBe(false);
  });
});
