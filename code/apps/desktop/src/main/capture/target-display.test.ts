import { describe, expect, it } from "vitest";
import type { DisplayGeometry, WindowGeometry } from "./picker";
import { displayOfTarget, lostDisplay, titleOfTarget } from "./target-display";

const left: DisplayGeometry = { id: "1", name: "Left", bounds: { x: 0, y: 0, width: 1000, height: 800 }, scaleFactor: 1 };
const right: DisplayGeometry = { id: "2", name: "Right", bounds: { x: 1000, y: 0, width: 1000, height: 800 }, scaleFactor: 1 };
const win = (x: number, w = 400): WindowGeometry => ({ id: "w1", title: "App", rect: { x, y: 100, width: w, height: 300 } });

describe("displayOfTarget", () => {
  it("is the chosen display for a screen and for an area", () => {
    expect(displayOfTarget({ kind: "screen", displayId: "2" }, [left, right], [])).toBe(right);
    expect(displayOfTarget({ kind: "area", displayId: "1", rect: { x: 0, y: 0, width: 50, height: 50 } }, [left, right], [])).toBe(left);
  });
  it("is the display that shows most of a window", () => {
    const t = { kind: "window", windowId: "w1", title: "App" } as const;
    expect(displayOfTarget(t, [left, right], [win(700)])).toBe(left);
    expect(displayOfTarget(t, [left, right], [win(900)])).toBe(right);
    expect(displayOfTarget(t, [left, right], [win(1100)])).toBe(right);
  });
  it("is undefined for a window that is gone, off every display, or a display that is unknown", () => {
    const t = { kind: "window", windowId: "w1", title: "App" } as const;
    expect(displayOfTarget(t, [left, right], [])).toBeUndefined();
    expect(displayOfTarget(t, [left, right], [win(5000)])).toBeUndefined();
    expect(displayOfTarget({ kind: "screen", displayId: "9" }, [left], [])).toBeUndefined();
  });
});

describe("lostDisplay", () => {
  it("is true when the recorded screen is no longer there", () => {
    expect(lostDisplay({ kind: "screen", displayId: "2" }, [left])).toBe(true);
    expect(lostDisplay({ kind: "area", displayId: "2", rect: { x: 0, y: 0, width: 50, height: 50 } }, [left])).toBe(true);
  });
  it("is false while it is there, and for a window", () => {
    expect(lostDisplay({ kind: "screen", displayId: "2" }, [left, right])).toBe(false);
    expect(lostDisplay({ kind: "window", windowId: "w", title: "t" }, [])).toBe(false);
  });
});

describe("titleOfTarget", () => {
  it("is the window title, the display name, or the display name with Area", () => {
    expect(titleOfTarget({ kind: "window", windowId: "w", title: "Editor" }, [left])).toBe("Editor");
    expect(titleOfTarget({ kind: "screen", displayId: "2" }, [left, right])).toBe("Right");
    expect(titleOfTarget({ kind: "area", displayId: "1", rect: { x: 0, y: 0, width: 50, height: 50 } }, [left, right])).toBe("Left · Area");
  });
  it("calls a display that is gone Screen", () => {
    expect(titleOfTarget({ kind: "screen", displayId: "9" }, [left])).toBe("Screen");
    expect(titleOfTarget({ kind: "area", displayId: "9", rect: { x: 0, y: 0, width: 50, height: 50 } }, [])).toBe("Screen · Area");
  });
});
