import { describe, expect, it } from "vitest";
import { createShiftInk } from "./shift-ink";

describe("Shift ink", () => {
  it("starts drawing after a hold during a recording and ends on release", () => {
    const s = createShiftInk();
    expect(s.event({ kind: "down" }, 0, true)).toEqual([]);
    expect(s.tick(299, true)).toEqual([]);
    expect(s.tick(300, true)).toEqual(["ink-start"]);
    expect(s.tick(500, true)).toEqual([]);
    expect(s.event({ kind: "up" }, 800, true)).toEqual(["ink-end"]);
    expect(s.down).toBe(false);
  });

  it("a short press draws nothing", () => {
    const s = createShiftInk();
    s.event({ kind: "down" }, 0, true);
    expect(s.tick(100, true)).toEqual([]);
    expect(s.event({ kind: "up" }, 150, true)).toEqual([]);
  });

  it("Shift with another key or a click never draws, even when held long", () => {
    const s = createShiftInk();
    s.event({ kind: "down" }, 0, true);
    s.event({ kind: "other" }, 50, true);
    expect(s.tick(1000, true)).toEqual([]);
    expect(s.event({ kind: "up" }, 1100, true)).toEqual([]);
  });

  it("a press that began outside a recording does not draw when the recording starts later", () => {
    const s = createShiftInk();
    s.event({ kind: "down" }, 0, false);
    expect(s.tick(1000, true)).toEqual([]);
    expect(s.event({ kind: "up" }, 1100, true)).toEqual([]);
  });

  it("does not start when the recording ended while Shift was down", () => {
    const s = createShiftInk();
    s.event({ kind: "down" }, 0, true);
    expect(s.tick(1000, false)).toEqual([]);
  });

  it("key repeat while down keeps the first press time", () => {
    const s = createShiftInk();
    s.event({ kind: "down" }, 0, true);
    s.event({ kind: "down" }, 200, true);
    expect(s.tick(300, true)).toEqual(["ink-start"]);
  });

  it("a key pressed during drawing does not end it; only the release does", () => {
    const s = createShiftInk();
    s.event({ kind: "down" }, 0, true);
    s.tick(400, true);
    expect(s.event({ kind: "other" }, 500, true)).toEqual([]);
    expect(s.event({ kind: "up" }, 900, true)).toEqual(["ink-end"]);
  });

  it("reset forgets a press and a drawing", () => {
    const s = createShiftInk();
    s.event({ kind: "down" }, 0, true);
    s.tick(400, true);
    s.reset();
    expect(s.down).toBe(false);
    expect(s.event({ kind: "up" }, 500, true)).toEqual([]);
  });

  it("an up without a down does nothing", () => {
    expect(createShiftInk().event({ kind: "up" }, 0, true)).toEqual([]);
  });
});
