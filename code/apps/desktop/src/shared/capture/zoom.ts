import * as v from "valibot";

/** A part of a recording shown closer: from `startMs` to `endMs` the picture is magnified `scale` times around the point (`x`, `y`), both as fractions of the picture (0 left or top, 1 right or bottom). */
export interface ZoomRegion {
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  scale: number;
}

/** Where the pointer was, as fractions of the recorded rectangle. */
export interface PointerSample {
  atMs: number;
  x: number;
  y: number;
}

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ZOOM = {
  minScale: 1.25,
  maxScale: 4,
  defaultScale: 2,
  maxRegions: 50,
  /** The shortest zoom worth showing. */
  minMs: 1000,
  /** Zooming in and out takes this long, so the picture glides instead of jumping. */
  easeMs: 300,
  /** The pointer rests when it stays within this distance (fraction of the picture) for `dwellMs`. */
  restRadius: 0.05,
  dwellMs: 800,
  /** A zoom stays this long after the pointer rests, and a drawn stroke zooms for this long. */
  holdMs: 800,
  inkMs: 2000,
  maxAutoMs: 5000,
  /** At most one pointer sample is kept per this many milliseconds, and at most this many in all. */
  sampleEveryMs: 200,
  maxSamples: 20_000,
} as const;

const unit = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const time = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(86_400_000));
export const ZoomRegionSchema = v.object({ startMs: time, endMs: time, x: unit, y: unit, scale: v.pipe(v.number(), v.minValue(ZOOM.minScale), v.maxValue(ZOOM.maxScale)) });
export const ZoomRegionsSchema = v.pipe(v.array(ZoomRegionSchema), v.maxLength(ZOOM.maxRegions));

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Regions as they can be used: inside the recording, at least `minMs` long, in time order and not overlapping (a later one starts where the earlier ends). */
export function normalizeRegions(regions: readonly ZoomRegion[], durationMs: number): ZoomRegion[] {
  const out: ZoomRegion[] = [];
  const sorted = regions.map((r) => ({ ...r, startMs: clamp(r.startMs, 0, durationMs), endMs: clamp(r.endMs, 0, durationMs) })).sort((a, b) => a.startMs - b.startMs);
  for (const r of sorted) {
    const prev = out[out.length - 1];
    const startMs = prev ? Math.max(r.startMs, prev.endMs) : r.startMs;
    if (r.endMs - startMs >= ZOOM.minMs) out.push({ startMs, endMs: r.endMs, x: clamp(r.x, 0, 1), y: clamp(r.y, 0, 1), scale: clamp(r.scale, ZOOM.minScale, ZOOM.maxScale) });
  }
  return out.slice(0, ZOOM.maxRegions);
}

/** The part of the picture a region shows, as fractions of it: a window of 1/scale of each side, centred on the point and kept inside the picture. */
export function cropOfRegion(r: Pick<ZoomRegion, "x" | "y" | "scale">): FrameRect {
  const size = 1 / r.scale;
  return { x: clamp(r.x - size / 2, 0, 1 - size), y: clamp(r.y - size / 2, 0, 1 - size), width: size, height: size };
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const FULL: FrameRect = { x: 0, y: 0, width: 1, height: 1 };

/** The part of the picture to show at a moment (fractions): the whole picture outside every region, the region's crop inside it, and a smooth glide in and out at its edges. */
export function cropAt(regions: readonly ZoomRegion[], atMs: number): FrameRect {
  const r = regions.find((x) => atMs >= x.startMs && atMs <= x.endMs);
  if (!r) return FULL;
  const edge = Math.min(atMs - r.startMs, r.endMs - atMs);
  const k = smooth(clamp(edge / ZOOM.easeMs, 0, 1));
  const c = cropOfRegion(r);
  const mix = (a: number, b: number) => a + (b - a) * k;
  return { x: mix(0, c.x), y: mix(0, c.y), width: mix(1, c.width), height: mix(1, c.height) };
}

/** A fraction rectangle in the pixels of a picture. */
export const inPixels = (c: FrameRect, width: number, height: number): FrameRect => ({ x: c.x * width, y: c.y * height, width: c.width * width, height: c.height * height });

const near = (a: PointerSample, b: PointerSample) => Math.hypot(a.x - b.x, a.y - b.y) <= ZOOM.restRadius;

/** Moments where the pointer stayed put: runs of samples within the rest radius of the first one that last at least `dwellMs`. */
function rests(samples: readonly PointerSample[]): { startMs: number; endMs: number; x: number; y: number }[] {
  const out: { startMs: number; endMs: number; x: number; y: number }[] = [];
  let from = 0;
  while (from < samples.length) {
    let to = from;
    while (to + 1 < samples.length && near(samples[from]!, samples[to + 1]!)) to++;
    const run = samples.slice(from, to + 1);
    const startMs = run[0]!.atMs;
    const endMs = run[run.length - 1]!.atMs;
    if (endMs - startMs >= ZOOM.dwellMs) out.push({ startMs, endMs, x: run.reduce((s, p) => s + p.x, 0) / run.length, y: run.reduce((s, p) => s + p.y, 0) / run.length });
    from = to + 1;
  }
  return out;
}

const pointerAt = (samples: readonly PointerSample[], atMs: number): PointerSample | undefined =>
  samples.reduce<PointerSample | undefined>((best, p) => (!best || Math.abs(p.atMs - atMs) < Math.abs(best.atMs - atMs) ? p : best), undefined);

/**
 * Zooms chosen from the pointer: one where it rests (it holds a little after it moves on), and one where a stroke was drawn with the pen. Clicks are
 * not seen, so where the pointer rests stands for where the person looked. The result is in time order and does not overlap.
 */
export function autoRegions(samples: readonly PointerSample[], inkStarts: readonly number[], durationMs: number): ZoomRegion[] {
  const fromRests = rests(samples).map((r) => ({ startMs: r.startMs, endMs: Math.min(r.endMs + ZOOM.holdMs, r.startMs + ZOOM.maxAutoMs), x: r.x, y: r.y, scale: ZOOM.defaultScale }));
  const fromInk = inkStarts.flatMap((at) => {
    const p = pointerAt(samples, at);
    return p ? [{ startMs: at, endMs: at + ZOOM.inkMs, x: p.x, y: p.y, scale: ZOOM.defaultScale }] : [];
  });
  return normalizeRegions([...fromRests, ...fromInk], durationMs);
}

/** Keeps at most one pointer sample per `sampleEveryMs`, in order, up to the cap. */
export function addSample(samples: PointerSample[], s: PointerSample): void {
  const last = samples[samples.length - 1];
  if (samples.length >= ZOOM.maxSamples || (last && s.atMs - last.atMs < ZOOM.sampleEveryMs)) return;
  samples.push(s);
}

/** Where a desktop point falls in a recorded rectangle, as fractions; undefined outside it. */
export function fractionIn(rect: FrameRect, point: { x: number; y: number }): { x: number; y: number } | undefined {
  const x = (point.x - rect.x) / rect.width;
  const y = (point.y - rect.y) / rect.height;
  return rect.width > 0 && rect.height > 0 && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : undefined;
}

/** The picture of each region for the zoom contact sheet: the frame nearest the middle of the region, and the part of it the region shows. */
export function zoomCells<F extends { atMs: number }>(regions: readonly ZoomRegion[], frames: readonly F[]): { frame: F; crop: FrameRect }[] {
  return regions.flatMap((r) => {
    const mid = (r.startMs + r.endMs) / 2;
    const frame = frames.reduce<F | undefined>((best, f) => (!best || Math.abs(f.atMs - mid) < Math.abs(best.atMs - mid) ? f : best), undefined);
    return frame ? [{ frame, crop: cropOfRegion(r) }] : [];
  });
}
