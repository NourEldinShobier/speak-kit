import type { Point, Size } from "./model";

const STEP = 10;
const DIRECTION: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };

/** Where an arrow key moves the keyboard pointer (5 times as far with Shift), kept inside the picture. Undefined for any other key. */
export function movePointer(at: Point, e: { key: string; shiftKey: boolean }, bounds: Size): Point | undefined {
  const d = DIRECTION[e.key];
  if (!d) return undefined;
  const step = e.shiftKey ? STEP * 5 : STEP;
  return { x: Math.min(bounds.width, Math.max(0, at.x + d.x * step)), y: Math.min(bounds.height, Math.max(0, at.y + d.y * step)) };
}

export type Shortcut = "undo" | "redo";

/** Undo and redo keys: Ctrl or Command with Z, Shift added for redo, or Y. */
export function shortcutOf(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): Shortcut | undefined {
  if (!(e.ctrlKey || e.metaKey)) return undefined;
  const k = e.key.toLowerCase();
  if (k === "y") return "redo";
  if (k !== "z") return undefined;
  return e.shiftKey ? "redo" : "undo";
}
