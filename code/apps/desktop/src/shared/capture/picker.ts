export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_AREA = 36;

export interface DisplayGeometry {
  id: string;
  name: string;
  /** Position and size in device-independent pixels (what the overlay window uses). */
  bounds: Rect;
  scaleFactor: number;
}

export interface WindowGeometry {
  id: string;
  title: string;
  /** Desktop rectangle in device-independent pixels, topmost first in the list. */
  rect: Rect;
}

export type PickResult = { kind: "screen"; displayId: string } | { kind: "window"; windowId: string; title: string } | { kind: "area"; displayId: string; rect: Rect };

export const displayAt = (p: { x: number; y: number }, displays: readonly DisplayGeometry[]): DisplayGeometry | undefined =>
  displays.find((d) => p.x >= d.bounds.x && p.x < d.bounds.x + d.bounds.width && p.y >= d.bounds.y && p.y < d.bounds.y + d.bounds.height);

/** The topmost window under the point; `windows` is ordered topmost first. */
export const windowAt = (p: { x: number; y: number }, windows: readonly WindowGeometry[]): WindowGeometry | undefined =>
  windows.find((w) => p.x >= w.rect.x && p.x < w.rect.x + w.rect.width && p.y >= w.rect.y && p.y < w.rect.y + w.rect.height);

/** The rectangle between two dragged points, kept inside the display, or undefined when it is smaller than 36 by 36 pixels. */
export function areaBetween(a: { x: number; y: number }, b: { x: number; y: number }, display: DisplayGeometry): Rect | undefined {
  const { x, y, width, height } = display.bounds;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const x1 = clamp(Math.min(a.x, b.x), x, x + width);
  const x2 = clamp(Math.max(a.x, b.x), x, x + width);
  const y1 = clamp(Math.min(a.y, b.y), y, y + height);
  const y2 = clamp(Math.max(a.y, b.y), y, y + height);
  const r = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  return r.width >= MIN_AREA && r.height >= MIN_AREA ? r : undefined;
}

/**
 * A rectangle of one display in device-independent pixels, as pixels of that display's own picture. Each display has its own scale, so a rectangle is
 * measured from its display's corner and multiplied by that display's factor, never by the factor of another monitor (fractional scaling too).
 */
export function toDisplayPixels(rect: Rect, display: DisplayGeometry): Rect {
  const k = display.scaleFactor;
  return { x: Math.round((rect.x - display.bounds.x) * k), y: Math.round((rect.y - display.bounds.y) * k), width: Math.round(rect.width * k), height: Math.round(rect.height * k) };
}

export const describeDisplay = (d: DisplayGeometry): string =>
  `${d.name} · ${Math.round(d.bounds.width * d.scaleFactor)} × ${Math.round(d.bounds.height * d.scaleFactor)} · ${Math.round(d.scaleFactor * 100)}%`;

/** The mode the picker opens in on a display: what was chosen there last, else the whole screen. */
export const startMode = (last: Readonly<Record<string, "screen" | "window" | "area">>, displayId: string): "screen" | "window" | "area" => last[displayId] ?? "screen";

export const remember = (last: Readonly<Record<string, "screen" | "window" | "area">>, displayId: string, kind: "screen" | "window" | "area") => ({ ...last, [displayId]: kind });
