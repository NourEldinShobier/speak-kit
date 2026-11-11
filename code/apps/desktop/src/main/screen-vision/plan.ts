import { LOOK_IMAGE_WIDTH, MAX_LOOK_IMAGE_BYTES, type LookScope } from "@speakkit/protocol";

/** Pixels of the desktop, not device-independent units: what a capture and a window rectangle are measured in. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface DisplayInfo {
  id: string;
  bounds: Rect;
}
/** One top-level window as the capture API lists it. `rect` is undefined when its position cannot be read. */
export interface WindowInfo {
  id: string;
  name: string;
  rect: Rect | undefined;
}

export type Plan =
  | { ok: true; display: DisplayInfo; /** relative to the display; absent for the whole screen */ crop: Rect | undefined; target: string }
  | { ok: false; code: "no-window" | "capture-failed" };

export interface PlanInput {
  scope: LookScope;
  displays: readonly DisplayInfo[];
  cursor: Point;
  /** top of the stacking order first, without Speak Kit's own windows */
  windows: readonly WindowInfo[];
  /** the window the user is typing into, when the system says */
  foreground?: string | undefined;
}

/** Windows smaller than this are overlays and tool strips, not something the user is looking at. */
const MIN_WINDOW_SIDE = 80;

const intersect = (a: Rect, b: Rect): Rect | undefined => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const bt = Math.min(a.y + a.height, b.y + b.height);
  return r > x && bt > y ? { x, y, width: r - x, height: bt - y } : undefined;
};
const area = (r: Rect | undefined) => (r ? r.width * r.height : 0);

/**
 * What to capture. The screen scope takes the display under the cursor. The window scope takes the window the user is working in (the
 * foreground one, else the topmost) and the part of it that is on a display; it is cut out of that display's picture, so what the model sees is what the user sees there.
 */
export function planCapture({ scope, displays, cursor, windows, foreground }: PlanInput): Plan {
  if (!displays.length) return { ok: false, code: "capture-failed" };
  if (scope === "screen") {
    const under = displays.find((d) => intersect(d.bounds, { x: cursor.x, y: cursor.y, width: 1, height: 1 }));
    return { ok: true, display: under ?? displays[0]!, crop: undefined, target: "screen" };
  }
  const shown = windows.filter((w) => w.name.trim() && w.rect && w.rect.width >= MIN_WINDOW_SIDE && w.rect.height >= MIN_WINDOW_SIDE && displays.some((d) => intersect(d.bounds, w.rect!)));
  const win = shown.find((w) => foreground !== undefined && w.id.startsWith(`${foreground}:`)) ?? shown[0];
  if (!win?.rect) return { ok: false, code: "no-window" };
  const display = displays.reduce((best, d) => (area(intersect(d.bounds, win.rect!)) > area(intersect(best.bounds, win.rect!)) ? d : best));
  const part = intersect(display.bounds, win.rect)!;
  return { ok: true, display, crop: { x: part.x - display.bounds.x, y: part.y - display.bounds.y, width: part.width, height: part.height }, target: win.name.trim().slice(0, 120) };
}

/** The size a picture of `width` x `height` is sent at: its longest side at most LOOK_IMAGE_WIDTH, never enlarged. */
export function sendSize(width: number, height: number): { width: number; height: number } {
  const k = Math.min(1, LOOK_IMAGE_WIDTH / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** From the nicest to the smallest: each step is tried until the JPEG fits in the data channel. */
const LADDER: readonly { scale: number; quality: number }[] = [
  { scale: 1, quality: 80 },
  { scale: 1, quality: 65 },
  { scale: 1, quality: 50 },
  { scale: 0.75, quality: 60 },
  { scale: 0.5, quality: 60 },
];

/** The first JPEG of the ladder that is at most `maxBytes`, or undefined when even the smallest is not. `encode` gets the size and the quality. */
export function fitJpeg(base: { width: number; height: number }, encode: (width: number, height: number, quality: number) => Uint8Array, maxBytes = MAX_LOOK_IMAGE_BYTES) {
  for (const { scale, quality } of LADDER) {
    const width = Math.max(1, Math.round(base.width * scale));
    const height = Math.max(1, Math.round(base.height * scale));
    const jpeg = encode(width, height, quality);
    if (jpeg.length <= maxBytes) return { jpeg, width, height };
  }
  return undefined;
}

/** A small picture: BGRA bytes, 4 per pixel, as the capture API hands them out. */
export interface Bitmap {
  width: number;
  height: number;
  bgra: Uint8Array;
}

/** A pixel counts as black when its brightest channel is at most this: pure black of a protected surface, not the grey of a dark theme. */
const BLACK_MAX = 6;
const WHOLE = 0.99;
const BIG_AREA = 0.2;

/**
 * Whether a picture shows nothing (every pixel black: a locked screen, a window that blocks capture) or a big black rectangle (protected video
 * is black while the rest of the window draws). Works on a picture shrunk to a few dozen pixels per side.
 */
export function blackness(b: Bitmap): "black" | "partly" | undefined {
  const { width: w, height: h } = b;
  if (!w || !h) return undefined;
  const heights = Array.from({ length: w }, () => 0);
  let black = 0;
  let best = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dark = Math.max(b.bgra[i]!, b.bgra[i + 1]!, b.bgra[i + 2]!) <= BLACK_MAX;
      heights[x] = dark ? heights[x]! + 1 : 0;
      if (dark) black++;
    }
    best = Math.max(best, largestRectangle(heights));
  }
  if (black / (w * h) >= WHOLE) return "black";
  return best / (w * h) >= BIG_AREA ? "partly" : undefined;
}

/** Area of the largest rectangle under a histogram (the usual stack method). */
function largestRectangle(heights: readonly number[]): number {
  const stack: number[] = [];
  let best = 0;
  for (let i = 0; i <= heights.length; i++) {
    const cur = i === heights.length ? 0 : heights[i]!;
    while (stack.length && heights[stack.at(-1)!]! >= cur) {
      const top = heights[stack.pop()!]!;
      best = Math.max(best, top * (stack.length ? i - stack.at(-1)! - 1 : i));
    }
    stack.push(i);
  }
  return best;
}
