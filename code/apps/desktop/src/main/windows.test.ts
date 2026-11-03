import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const made = vi.hoisted(() => ({ calls: [] as string[][] }));
vi.mock("electron", () => ({ screen: {} }));
vi.mock("./secure-window", () => ({
  createSecureWindow: () => {
    const calls: string[][] = [];
    made.calls = calls;
    return {
      on: () => {},
      loadFile: () => {},
      getSize: () => [340, 330],
      setBounds: () => {},
      isVisible: () => false,
      isDestroyed: () => false,
      destroy: () => {},
      show: () => {},
      showInactive: () => {},
      setAlwaysOnTop: (...a: unknown[]) => calls.push(["alwaysOnTop", ...a.map(String)]),
      setVisibleOnAllWorkspaces: (...a: unknown[]) => calls.push(["workspaces", JSON.stringify(a)]),
    };
  },
}));

import { FloatWindow } from "./windows";

const open = (platform: NodeJS.Platform) => {
  vi.stubGlobal("process", { ...process, platform });
  new FloatWindow("panel", { width: 340, height: 330 }, () => ({}) as never).open({ x: 0, y: 0, width: 340, height: 330 }, true);
  return made.calls;
};

describe("FloatWindow on macOS", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("floats over full-screen apps on every Space without hiding the Dock icon", () => {
    expect(open("darwin")).toEqual([
      ["alwaysOnTop", "true", "floating"],
      ["workspaces", JSON.stringify([true, { visibleOnFullScreen: true, skipTransformProcessType: true }])],
    ]);
  });

  it("leaves other platforms alone", () => {
    expect(open("win32")).toEqual([]);
  });
});

describe("floatClosedWithin", () => {
  afterEach(() => vi.useRealTimers());

  it("is true for a moment after a float window was destroyed, then false", async () => {
    vi.useFakeTimers();
    const { floatClosedWithin } = await import("./windows");
    expect(floatClosedWithin(400)).toBe(false);
    const w = new FloatWindow("mini", { width: 360, height: 112 }, () => ({}) as never);
    w.open({ x: 0, y: 0, width: 360, height: 112 }, false);
    w.close();
    expect(floatClosedWithin(400)).toBe(true);
    vi.advanceTimersByTime(401);
    expect(floatClosedWithin(400)).toBe(false);
  });
});
