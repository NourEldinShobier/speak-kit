import { describe, expect, it } from "vitest";
import { arrowHead, draw, newEditor, type Editor, type Point, type Tool } from "./model";
import { exportSurface, INK, paint, type Surface } from "./render";
import { setCrop } from "./model";

type Call = [string, ...unknown[]];

/** A canvas that notes every call and every property that is set, in order. */
function recorder() {
  const log: Call[] = [];
  const made: Surface[] = [];
  const surface = (width = 0, height = 0): Surface => {
    const ctx = new Proxy({} as Record<string, unknown>, {
      get:
        (_t, k: string) =>
        (...args: unknown[]) =>
          void log.push([k, ...args]),
      set: (_t, k: string, v) => (log.push([`set ${k}`, v]), true),
    });
    const id = `s${made.length}`;
    const out = { id, width, height, getContext: (kind: string) => (kind === "2d" ? ctx : null) } as unknown as Surface;
    made.push(out);
    return out;
  };
  return { log, surface, made };
}

const image = {} as CanvasImageSource;
const base = (): Editor => newEditor(1000, 500);
const d = (e: Editor, tool: Exclude<Tool, "crop">, from: Point, to: Point, text?: string) => draw(e, tool, { from, to, ...(text !== undefined && { text }) });

function paintOne(e: Editor) {
  const r = recorder();
  paint(r.surface(), e, { image, make: r.surface });
  // drop the call that puts the picture itself down
  return r.log.slice(1);
}

describe("painting a shape", () => {
  it("draws an arrow as a shaft and two barbs in one stroke, in the ink colour", () => {
    const [a, b] = arrowHead({ x: 10, y: 10 }, { x: 110, y: 10 }, 15);
    const calls = paintOne(d(base(), "arrow", { x: 10, y: 10 }, { x: 110, y: 10 }));
    expect(calls).toEqual([
      ["save"],
      ["set strokeStyle", INK],
      ["set fillStyle", INK],
      ["set lineWidth", 3],
      ["set lineCap", "round"],
      ["set lineJoin", "round"],
      ["beginPath"],
      ["moveTo", 10, 10],
      ["lineTo", 110, 10],
      ["moveTo", a.x, a.y],
      ["lineTo", 110, 10],
      ["lineTo", b.x, b.y],
      ["stroke"],
      ["restore"],
    ]);
  });

  it("outlines a rectangle", () => {
    const calls = paintOne(d(base(), "rect", { x: 20, y: 30 }, { x: 120, y: 80 }));
    expect(calls).toContainEqual(["strokeRect", 20, 30, 100, 50]);
    expect(calls).toContainEqual(["set strokeStyle", INK]);
    expect(calls).toContainEqual(["set lineWidth", 3]);
  });

  it("fills a highlight with translucent yellow", () => {
    const calls = paintOne(d(base(), "highlight", { x: 20, y: 30 }, { x: 120, y: 80 }));
    expect(calls).toContainEqual(["set globalAlpha", 0.35]);
    expect(calls).toContainEqual(["set fillStyle", "#facc15"]);
    expect(calls).toContainEqual(["fillRect", 20, 30, 100, 50]);
  });

  it("writes text white-edged first and ink-filled over it, at six times the line width", () => {
    const calls = paintOne(d(base(), "text", { x: 40, y: 60 }, { x: 40, y: 60 }, "look"));
    expect(calls).toContainEqual(["set font", "600 18px system-ui, sans-serif"]);
    expect(calls).toContainEqual(["set textBaseline", "top"]);
    expect(calls).toContainEqual(["set strokeStyle", "#ffffff"]);
    const stroke = calls.findIndex((c) => c[0] === "strokeText");
    const fill = calls.findIndex((c) => c[0] === "fillText");
    expect(calls[stroke]).toEqual(["strokeText", "look", 40, 60]);
    expect(calls[fill]).toEqual(["fillText", "look", 40, 60]);
    expect(stroke).toBeLessThan(fill);
  });

  it("scales line width, text size and arrow head with the picture", () => {
    const wide = newEditor(4000, 2000);
    const calls = paintOne(d(wide, "text", { x: 0, y: 0 }, { x: 0, y: 0 }, "big"));
    expect(calls).toContainEqual(["set lineWidth", 10]);
    expect(calls).toContainEqual(["set font", "600 60px system-ui, sans-serif"]);
  });

  it("restores the canvas after every shape", () => {
    let e = d(base(), "rect", { x: 0, y: 0 }, { x: 50, y: 50 });
    e = d(e, "highlight", { x: 0, y: 0 }, { x: 50, y: 50 });
    e = d(e, "arrow", { x: 0, y: 0 }, { x: 80, y: 0 });
    e = d(e, "text", { x: 5, y: 5 }, { x: 5, y: 5 }, "t");
    const calls = paintOne(e);
    expect(calls.filter((c) => c[0] === "save")).toHaveLength(4);
    expect(calls.filter((c) => c[0] === "restore")).toHaveLength(4);
  });

  it("paints nothing but the picture for an untouched editor", () => {
    expect(paintOne(base())).toEqual([]);
  });

  it("throws when the canvas has no 2D context", () => {
    const none = { getContext: () => null } as unknown as Surface;
    expect(() => paint(none, base(), { image, make: recorder().surface })).toThrow("no 2d canvas");
  });
});

describe("blurring", () => {
  it("shrinks the region from the original to a twelfth, then draws it back large without smoothing", () => {
    const r = recorder();
    const main = r.surface();
    const e = d(base(), "blur", { x: 100, y: 100 }, { x: 220, y: 160 });
    paint(main, e, { image, make: r.surface });
    const calls = r.log.map((c) => c[0]);
    expect(r.log).toContainEqual(["drawImage", image, 100, 100, 120, 60, 0, 0, 10, 5]);
    expect(r.log).toContainEqual(["set imageSmoothingEnabled", false]);
    const back = r.log.findIndex((c) => c[0] === "drawImage" && c[1] !== image && c.length === 10);
    expect(r.log[back]).toEqual(["drawImage", r.made[1], 0, 0, 10, 5, 100, 100, 120, 60]);
    // the shrunk copy is a surface of its own, 10 by 5
    expect([r.made[1]!.width, r.made[1]!.height]).toEqual([10, 5]);
    expect(calls.filter((c) => c === "drawImage")).toHaveLength(3);
    // save before and restore after the smoothing change
    const smoothing = r.log.findIndex((c) => c[0] === "set imageSmoothingEnabled");
    expect(r.log[smoothing - 1]).toEqual(["save"]);
    expect(r.log[back + 1]).toEqual(["restore"]);
  });

  it("makes at least one pixel of the shrunk copy for a small region", () => {
    const r = recorder();
    const e = d(base(), "blur", { x: 0, y: 0 }, { x: 6, y: 6 });
    paint(r.surface(), e, { image, make: r.surface });
    expect([r.made[1]!.width, r.made[1]!.height]).toEqual([1, 1]);
  });
});

describe("the finished picture", () => {
  const exportOf = (e: Editor) => {
    const r = recorder();
    const out = exportSurface(e, { image, make: r.surface });
    return { r, out };
  };

  it("is the painted picture itself without a crop, and nothing else is made", () => {
    const { r, out } = exportOf(base());
    expect(out).toBe(r.made[0]);
    expect(r.made).toHaveLength(1);
    expect([out.width, out.height]).toEqual([1000, 500]);
    expect(r.log[0]).toEqual(["drawImage", image, 0, 0]);
  });

  it("is cut to the crop on a surface of its own, taken from the painted picture", () => {
    const e = setCrop(base(), { from: { x: 100, y: 50 }, to: { x: 400, y: 250 } });
    const { r, out } = exportOf(e);
    expect(out).toBe(r.made[1]);
    expect([out.width, out.height]).toEqual([300, 200]);
    expect(r.log).toContainEqual(["drawImage", r.made[0], 100, 50, 300, 200, 0, 0, 300, 200]);
  });

  it("is still cut when only the height or only the width is smaller", () => {
    const tall = exportOf(setCrop(base(), { from: { x: 0, y: 0 }, to: { x: 1000, y: 300 } }));
    expect([tall.out.width, tall.out.height]).toEqual([1000, 300]);
    expect(tall.out).toBe(tall.r.made[1]);
    const narrow = exportOf(setCrop(base(), { from: { x: 0, y: 0 }, to: { x: 600, y: 500 } }));
    expect([narrow.out.width, narrow.out.height]).toEqual([600, 500]);
    expect(narrow.out).toBe(narrow.r.made[1]);
  });

  it("draws a blur once, not again with the marks", () => {
    const r = recorder();
    paint(r.surface(), d(base(), "blur", { x: 100, y: 100 }, { x: 220, y: 160 }), { image, make: r.surface });
    expect(r.log.filter((c) => c[0] === "save")).toHaveLength(2);
  });
});
