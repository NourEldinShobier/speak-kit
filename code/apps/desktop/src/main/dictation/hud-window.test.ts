import { describe, expect, it, vi } from "vite-plus/test";

const h = vi.hoisted(() => ({
  scripts: [] as string[],
  handlers: {} as Record<string, () => void>,
  destroyed: false,
}));

vi.mock("electron", () => ({ screen: { getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }), getCursorScreenPoint: () => ({ x: 0, y: 0 }) } }));
vi.mock("../secure-window", () => ({
  createSecureWindow: () => ({
    webContents: {
      on: (name: string, fn: () => void) => void (h.handlers[name] = fn),
      send: () => {},
      executeJavaScript: (s: string) => (h.scripts.push(s), Promise.resolve()),
    },
    isDestroyed: () => h.destroyed,
    setIgnoreMouseEvents: () => {},
    loadURL: () => Promise.resolve(),
    setPosition: () => {},
    showInactive: () => {},
    hide: () => {},
    destroy: () => {},
    setAlwaysOnTop: () => {},
    setVisibleOnAllWorkspaces: () => {},
    setFullScreenable: () => {},
  }),
}));
vi.mock("./hud-chrome", () => ({ hudChrome: () => ({ window: {} }), raiseAboveEverything: () => {} }));

import { motionScript, openHudWindow } from "./hud-window";

describe("the HUD page and Reduce motion", () => {
  it("writes the decision as an attribute the style sheet reads", () => {
    expect(motionScript(true)).toBe('document.documentElement.setAttribute("data-reduce-motion", "on")');
    expect(motionScript(false)).toBe('document.documentElement.setAttribute("data-reduce-motion", "off")');
  });

  it("applies the setting as it was when the window opened, once the page has loaded", () => {
    h.scripts.length = 0;
    h.destroyed = false;
    openHudWindow({ reduceMotion: () => true });
    h.handlers["did-finish-load"]!();
    expect(h.scripts).toEqual([motionScript(true)]);
  });

  it("applies a change at once, and not to a window that is gone", () => {
    h.scripts.length = 0;
    h.destroyed = false;
    const w = openHudWindow({ reduceMotion: () => false });
    w.setReduceMotion!(true);
    expect(h.scripts).toEqual([motionScript(true)]);
    h.destroyed = true;
    w.setReduceMotion!(false);
    expect(h.scripts).toEqual([motionScript(true)]);
  });

  it("starts with motion on when nothing says otherwise", () => {
    h.scripts.length = 0;
    h.destroyed = false;
    openHudWindow();
    h.handlers["did-finish-load"]!();
    expect(h.scripts).toEqual([motionScript(false)]);
  });
});
