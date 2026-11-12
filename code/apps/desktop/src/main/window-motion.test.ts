import { describe, expect, it, vi } from "vite-plus/test";

const os = vi.hoisted(() => ({ reduce: false }));
vi.mock("electron", () => ({ systemPreferences: { getAnimationSettings: () => ({ prefersReducedMotion: os.reduce }) } }));

import { createWindowMotion, motionNow, motionScript } from "./window-motion";

function fakeWindow() {
  const w = {
    scripts: [] as string[],
    destroyed: false,
    loaded: () => {},
    isDestroyed: () => w.destroyed,
    webContents: {
      executeJavaScript: (s: string) => (w.scripts.push(s), Promise.resolve()),
      on: (_e: "did-finish-load", fn: () => void) => void (w.loaded = fn),
    },
  };
  return w;
}

describe("motionScript", () => {
  it("writes the decision as an attribute the style sheet reads", () => {
    expect(motionScript(true)).toBe('document.documentElement.setAttribute("data-reduce-motion", "on")');
    expect(motionScript(false)).toBe('document.documentElement.setAttribute("data-reduce-motion", "off")');
  });
});

describe("createWindowMotion", () => {
  it("gives a window the current decision once its page has loaded", () => {
    const m = createWindowMotion();
    m.set(true);
    const w = fakeWindow();
    m.add(w);
    expect(w.scripts).toEqual([]);
    w.loaded();
    expect(w.scripts).toEqual([motionScript(true)]);
  });

  it("starts with motion on", () => {
    const m = createWindowMotion();
    const w = fakeWindow();
    m.add(w);
    w.loaded();
    expect(w.scripts).toEqual([motionScript(false)]);
  });

  it("tells every open window about a change", () => {
    const m = createWindowMotion();
    const [a, b] = [fakeWindow(), fakeWindow()];
    m.add(a);
    m.add(b);
    m.set(true);
    m.set(false);
    expect(a.scripts).toEqual([motionScript(true), motionScript(false)]);
    expect(b.scripts).toEqual(a.scripts);
  });

  it("skips a window that is gone and forgets it", () => {
    const m = createWindowMotion();
    const w = fakeWindow();
    m.add(w);
    w.destroyed = true;
    m.set(true);
    w.destroyed = false;
    m.set(false);
    expect(w.scripts).toEqual([]);
  });

  it("does not run a script on a page that finished loading after its window was destroyed", () => {
    const m = createWindowMotion();
    const w = fakeWindow();
    m.add(w);
    w.destroyed = true;
    w.loaded();
    expect(w.scripts).toEqual([]);
  });
});

describe("motionNow", () => {
  it("follows the operating system on System, and the app setting otherwise", () => {
    os.reduce = true;
    expect(motionNow("system")).toBe(true);
    expect(motionNow("off")).toBe(false);
    os.reduce = false;
    expect(motionNow("system")).toBe(false);
    expect(motionNow("on")).toBe(true);
  });
});
