import { describe, expect, it } from "vite-plus/test";
import { hudChrome, raiseAboveEverything } from "./hud-chrome";

describe("hudChrome", () => {
  it("makes the pill a non-activating panel on every Space on macOS", () => {
    expect(hudChrome("darwin")).toEqual({ window: { type: "panel" }, allSpaces: true });
  });

  it("adds nothing on Windows and other systems", () => {
    expect(hudChrome("win32")).toEqual({ window: {}, allSpaces: false });
    expect(hudChrome("linux")).toEqual({ window: {}, allSpaces: false });
  });
});

describe("raiseAboveEverything", () => {
  const fake = () => {
    const calls: unknown[][] = [];
    return { calls, w: { setAlwaysOnTop: (...a: unknown[]) => void calls.push(["top", ...a]), setVisibleOnAllWorkspaces: (...a: unknown[]) => void calls.push(["spaces", ...a]) } };
  };

  it("keeps the pill above full-screen apps and shows it on every Space without losing the Dock icon on macOS", () => {
    const { w, calls } = fake();
    raiseAboveEverything(w as never, hudChrome("darwin"));
    expect(calls).toEqual([
      ["top", true, "screen-saver"],
      ["spaces", true, { visibleOnFullScreen: true, skipTransformProcessType: true }],
    ]);
  });

  it("only raises the level on Windows", () => {
    const { w, calls } = fake();
    raiseAboveEverything(w as never, hudChrome("win32"));
    expect(calls).toEqual([["top", true, "screen-saver"]]);
  });
});
