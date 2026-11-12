import { describe, expect, it } from "vitest";
import { arrowHead, canRedo, canUndo, draw, exportRect, isEdited, newEditor, rectBetween, redo, setCrop, strokeFor, undo, type Editor, type Point, type Tool } from "./model";
import { exportSurface, paint, type Surface } from "./render";

const start = () => newEditor(1000, 500);
const SIZE = { width: 1000, height: 500 };
const rb = (a: Point, b: Point) => rectBetween(a, b, SIZE);
const d = (e: Editor, tool: Exclude<Tool, "crop">, from: Point, to: Point, text?: string) => draw(e, tool, { from, to, ...(text !== undefined && { text }) });
const crop = (e: Editor, from: Point, to: Point) => setCrop(e, { from, to });

describe("annotation model", () => {
  it("makes a rectangle from a drag in any direction, cut to the picture", () => {
    expect(rb({ x: 300, y: 200 }, { x: 100, y: 50 })).toEqual({ x: 100, y: 50, width: 200, height: 150 });
    expect(rb({ x: -40, y: 10 }, { x: 2000, y: 600 })).toEqual({ x: 0, y: 10, width: 1000, height: 490 });
  });

  it("ignores a drag smaller than 6 pixels", () => {
    expect(rb({ x: 10, y: 10 }, { x: 15, y: 90 })).toBeUndefined();
    const e = start();
    expect(d(e, "rect", { x: 10, y: 10 }, { x: 12, y: 12 })).toBe(e);
    expect(d(e, "arrow", { x: 10, y: 10 }, { x: 13, y: 13 })).toBe(e);
  });

  it("adds each tool as its own shape", () => {
    let e = start();
    e = d(e, "arrow", { x: 0, y: 0 }, { x: 100, y: 0 });
    e = d(e, "rect", { x: 10, y: 10 }, { x: 60, y: 60 });
    e = d(e, "highlight", { x: 10, y: 10 }, { x: 60, y: 60 });
    e = d(e, "blur", { x: 10, y: 10 }, { x: 60, y: 60 });
    e = d(e, "text", { x: 5, y: 5 }, { x: 5, y: 5 }, "  look here ");
    expect(e.shapes.map((s) => s.kind)).toEqual(["arrow", "rect", "highlight", "blur", "text"]);
    expect(e.shapes[4]).toEqual({ kind: "text", at: { x: 5, y: 5 }, text: "look here" });
  });

  it("does not add empty text, and keeps text to 300 characters", () => {
    const e = start();
    expect(d(e, "text", { x: 1, y: 1 }, { x: 1, y: 1 }, "   ")).toBe(e);
    const long = d(e, "text", { x: 1, y: 1 }, { x: 1, y: 1 }, "x".repeat(400));
    expect(long.shapes[0]).toMatchObject({ text: "x".repeat(300) });
  });

  it("keeps points inside the picture", () => {
    const e = d(start(), "arrow", { x: -50, y: -50 }, { x: 5000, y: 5000 });
    expect(e.shapes[0]).toEqual({ kind: "arrow", from: { x: 0, y: 0 }, to: { x: 1000, y: 500 } });
  });

  it("undoes and redoes in order, and a new change clears redo", () => {
    let e = d(start(), "rect", { x: 0, y: 0 }, { x: 50, y: 50 });
    e = d(e, "arrow", { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(canUndo(e)).toBe(true);
    e = undo(e);
    expect(e.shapes).toHaveLength(1);
    expect(canRedo(e)).toBe(true);
    e = redo(e);
    expect(e.shapes).toHaveLength(2);
    e = undo(undo(e));
    expect(e.shapes).toHaveLength(0);
    expect(undo(e)).toBe(e);
    e = d(e, "rect", { x: 0, y: 0 }, { x: 50, y: 50 });
    expect(canRedo(e)).toBe(false);
    expect(redo(e)).toBe(e);
  });

  it("holds at most 100 undo steps", () => {
    let e = start();
    for (let i = 0; i < 120; i++) e = d(e, "rect", { x: 0, y: 0 }, { x: 10 + i, y: 50 });
    expect(e.undo).toHaveLength(100);
  });

  it("crops, undoes the crop, and a full-size drag clears it", () => {
    let e = crop(start(), { x: 100, y: 100 }, { x: 400, y: 300 });
    expect(exportRect(e)).toEqual({ x: 100, y: 100, width: 300, height: 200 });
    expect(isEdited(e)).toBe(true);
    expect(exportRect(undo(e))).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
    e = crop(e, { x: 0, y: 0 }, { x: 1000, y: 500 });
    expect(e.crop).toBeUndefined();
  });

  it("leaves the crop alone for a tiny drag or the same rectangle again", () => {
    const e = crop(start(), { x: 100, y: 100 }, { x: 400, y: 300 });
    expect(crop(e, { x: 3, y: 3 }, { x: 4, y: 4 })).toBe(e);
    expect(crop(e, { x: 100, y: 100 }, { x: 400, y: 300 })).toBe(e);
  });

  it("reports an untouched picture as not edited", () => {
    expect(isEdited(start())).toBe(false);
  });

  it("puts the arrow barbs behind the tip, mirrored about the shaft", () => {
    const [a, b] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(a.x).toBeCloseTo(100 - 10 * Math.cos(Math.PI / 7));
    expect(a.y).toBeCloseTo(-b.y);
    expect(a.x).toBeCloseTo(b.x);
  });

  it("scales the stroke with the picture", () => {
    expect([strokeFor(800), strokeFor(4000)]).toEqual([3, 10]);
  });
});

interface Call {
  on: string;
  op: string;
  args: unknown[];
}

function surfaces() {
  const calls: Call[] = [];
  const make = (w: number, h: number, name = `s${calls.length}`): Surface => {
    const props: Record<string, unknown> = {};
    const ctx = new Proxy(props, {
      get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => void calls.push({ on: name, op: k, args })),
      set: (t, k: string, v) => ((t[k] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    return { width: w, height: h, getContext: () => ctx } as unknown as Surface;
  };
  return { calls, make };
}

describe("annotation rendering", () => {
  const image = { img: true } as unknown as CanvasImageSource;

  it("draws the picture first and the blurs before the marks", () => {
    const { calls, make } = surfaces();
    let e = d(start(), "rect", { x: 0, y: 0 }, { x: 50, y: 50 });
    e = d(e, "blur", { x: 100, y: 100 }, { x: 220, y: 160 });
    paint(make(1000, 500, "main"), e, { image, make });
    const main = calls.filter((c) => c.on === "main").map((c) => c.op);
    expect(main[0]).toBe("drawImage");
    expect(main.indexOf("drawImage", 1)).toBeLessThan(main.indexOf("strokeRect"));
  });

  it("blurs by drawing the region at a twelfth of its size", () => {
    const { calls, make } = surfaces();
    const e = d(start(), "blur", { x: 100, y: 100 }, { x: 220, y: 160 });
    paint(make(1000, 500, "main"), e, { image, make });
    const small = calls.find((c) => c.on !== "main" && c.op === "drawImage")!;
    expect(small.args).toEqual([image, 100, 100, 120, 60, 0, 0, 10, 5]);
  });

  it("exports the crop as its own surface", () => {
    const { calls, make } = surfaces();
    const e = crop(start(), { x: 100, y: 100 }, { x: 400, y: 300 });
    const out = exportSurface(e, { image, make: (w, h) => make(w, h, `${w}x${h}`) });
    expect([out.width, out.height]).toEqual([300, 200]);
    expect(calls.some((c) => c.on === "300x200" && c.op === "drawImage" && JSON.stringify(c.args.slice(1)) === "[100,100,300,200,0,0,300,200]")).toBe(true);
  });

  it("exports at full size without a crop", () => {
    const { make } = surfaces();
    const out = exportSurface(start(), { image, make });
    expect([out.width, out.height]).toEqual([1000, 500]);
  });
});
