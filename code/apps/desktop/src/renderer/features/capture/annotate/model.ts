export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Tool = "arrow" | "rect" | "text" | "highlight" | "blur" | "crop";
export const TOOLS: readonly Tool[] = ["arrow", "rect", "text", "highlight", "blur", "crop"];

export type Shape =
  | { kind: "arrow"; from: Point; to: Point }
  | { kind: "rect"; rect: Rect }
  | { kind: "highlight"; rect: Rect }
  | { kind: "blur"; rect: Rect }
  | { kind: "text"; at: Point; text: string };

interface Snapshot {
  shapes: readonly Shape[];
  crop?: Rect | undefined;
}

/** The picture being edited with what was drawn on it. `undo` and `redo` hold earlier snapshots; a new change empties `redo`. */
export interface Editor extends Snapshot {
  width: number;
  height: number;
  undo: readonly Snapshot[];
  redo: readonly Snapshot[];
}

/** Smaller than this (in picture pixels) a drag is a click, not a shape. */
export const MIN_SIZE = 6;
const MAX_TEXT = 300;
const MAX_UNDO = 100;

export const newEditor = (width: number, height: number): Editor => ({ width, height, shapes: [], undo: [], redo: [] });

const snap = (e: Editor): Snapshot => ({ shapes: e.shapes, crop: e.crop });

function change(e: Editor, next: Snapshot): Editor {
  return { ...e, ...next, undo: [...e.undo, snap(e)].slice(-MAX_UNDO), redo: [] };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The rectangle between two corners, cut to the picture. Undefined when it is too small to mean anything. */
export function rectBetween(a: Point, b: Point, size: Size): Rect | undefined {
  const { width, height } = size;
  const x1 = clamp(Math.min(a.x, b.x), 0, width);
  const y1 = clamp(Math.min(a.y, b.y), 0, height);
  const x2 = clamp(Math.max(a.x, b.x), 0, width);
  const y2 = clamp(Math.max(a.y, b.y), 0, height);
  return x2 - x1 < MIN_SIZE || y2 - y1 < MIN_SIZE ? undefined : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Adds the shape a drag (or a click for text) made. Returns the same editor when there is nothing to add. */
export interface Stroke {
  from: Point;
  to: Point;
  /** What the text tool places. */
  text?: string;
}

export function draw(e: Editor, tool: Exclude<Tool, "crop">, { from, to, text = "" }: Stroke): Editor {
  const inside = (p: Point): Point => ({ x: clamp(p.x, 0, e.width), y: clamp(p.y, 0, e.height) });
  if (tool === "arrow") {
    const a = inside(from);
    const b = inside(to);
    return Math.hypot(b.x - a.x, b.y - a.y) < MIN_SIZE ? e : change(e, { ...snap(e), shapes: [...e.shapes, { kind: "arrow", from: a, to: b }] });
  }
  if (tool === "text") {
    const t = text.trim().slice(0, MAX_TEXT);
    return t ? change(e, { ...snap(e), shapes: [...e.shapes, { kind: "text", at: inside(from), text: t }] }) : e;
  }
  const rect = rectBetween(from, to, e);
  return rect ? change(e, { ...snap(e), shapes: [...e.shapes, { kind: tool, rect }] }) : e;
}

/** Sets the crop (a drag with the crop tool). A drag that is too small changes nothing; a drag over the whole picture clears the crop. Nothing is cut until export. */
export function setCrop(e: Editor, { from, to }: Stroke): Editor {
  const rect = rectBetween(from, to, e);
  if (!rect) return e;
  const next = rect.width === e.width && rect.height === e.height ? undefined : rect;
  return JSON.stringify(next) === JSON.stringify(e.crop) ? e : change(e, { shapes: e.shapes, crop: next });
}

export const canUndo = (e: Editor) => e.undo.length > 0;
export const canRedo = (e: Editor) => e.redo.length > 0;

export function undo(e: Editor): Editor {
  const prev = e.undo[e.undo.length - 1];
  return prev ? { ...e, ...prev, undo: e.undo.slice(0, -1), redo: [...e.redo, snap(e)] } : e;
}

export function redo(e: Editor): Editor {
  const next = e.redo[e.redo.length - 1];
  return next ? { ...e, ...next, redo: e.redo.slice(0, -1), undo: [...e.undo, snap(e)] } : e;
}

/** Whether saving would change anything. */
export const isEdited = (e: Editor) => e.shapes.length > 0 || !!e.crop;

/** The part of the picture that is exported. */
export const exportRect = (e: Editor): Rect => e.crop ?? { x: 0, y: 0, width: e.width, height: e.height };

/** The two barbs of an arrow head at `to`, as the points the lines end at. */
export function arrowHead(from: Point, to: Point, size = 16): [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 7;
  const barb = (a: number): Point => ({ x: to.x - size * Math.cos(a), y: to.y - size * Math.sin(a) });
  return [barb(angle - spread), barb(angle + spread)];
}

/** Line widths grow with big pictures so they stay visible when the picture is shown small. */
export const strokeFor = (width: number) => Math.max(3, Math.round(width / 400));
