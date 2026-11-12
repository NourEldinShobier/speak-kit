import type { DisplayGeometry, Rect, WindowGeometry } from "./picker";
import type { Target } from "./session";

const overlap = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** The display a capture is on: its own for a screen or an area, and for a window the one that shows most of it. Undefined when it cannot be told. */
export function displayOfTarget(t: Target, displays: readonly DisplayGeometry[], windows: readonly WindowGeometry[]): DisplayGeometry | undefined {
  if (t.kind !== "window") return displays.find((d) => d.id === t.displayId);
  const rect = windows.find((w) => w.id === t.windowId)?.rect;
  if (!rect) return undefined;
  let best: DisplayGeometry | undefined;
  let bestArea = 0;
  for (const d of displays) {
    const area = overlap(rect, d.bounds);
    if (area > bestArea) [best, bestArea] = [d, area];
  }
  return best;
}

/** True when the screen a recording shows was unplugged. A window follows its program and is not lost with a display. */
export function lostDisplay(t: Target, displays: readonly DisplayGeometry[]): boolean {
  return t.kind !== "window" && !displays.some((d) => d.id === t.displayId);
}

/** The name of a capture's target in the list and the capsule: the window's title, the display's name, or the display's name with "Area". */
export function titleOfTarget(t: Target, displays: readonly DisplayGeometry[]): string {
  if (t.kind === "window") return t.title;
  const name = displays.find((d) => d.id === t.displayId)?.name ?? "Screen";
  return t.kind === "area" ? `${name} · Area` : name;
}
