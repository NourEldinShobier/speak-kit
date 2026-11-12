export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: number;
  /** The area a window may use (without the taskbar or the menu bar). */
  workArea: Rect;
}

/** A saved corner is an offset from the monitor's top-left, so the capsule stays in the same place on that monitor when the layout shifts. */
export type Saved = Readonly<Record<string, { x: number; y: number }>>;

export const MARGIN = 24;

/** The key a monitor's position is saved under: its id and size, so a different monitor on the same port does not inherit the position. */
export const monitorKey = (d: DisplayInfo): string => `${d.id}:${d.workArea.width}x${d.workArea.height}`;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/** The top-right corner of the work area, the capsule's first place. */
export const defaultOffset = (d: DisplayInfo, size: { width: number }): { x: number; y: number } => ({ x: d.workArea.width - size.width - MARGIN, y: MARGIN });

/** Where the capsule goes: the saved place on this monitor (kept fully on it), else the top-right corner. Absolute screen position and the key to save under. */
export function place(display: DisplayInfo, saved: Saved, size: { width: number; height: number }): { x: number; y: number; key: string } {
  const key = monitorKey(display);
  const at = saved[key] ?? defaultOffset(display, size);
  const w = display.workArea;
  return { key, x: w.x + clamp(Math.round(at.x), 0, w.width - size.width), y: w.y + clamp(Math.round(at.y), 0, w.height - size.height) };
}

/** The monitor a point is on, else the first one (the primary is listed first), else none. */
export function displayAt(displays: readonly DisplayInfo[], point: { x: number; y: number }): DisplayInfo | undefined {
  return displays.find(({ workArea: w }) => point.x >= w.x && point.x < w.x + w.width && point.y >= w.y && point.y < w.y + w.height) ?? displays[0];
}

/** The offset to save after a drag ended at this absolute position on this monitor. */
export const offsetOf = (display: DisplayInfo, at: { x: number; y: number }): { x: number; y: number } => ({ x: Math.round(at.x - display.workArea.x), y: Math.round(at.y - display.workArea.y) });
