import { describe, expect, it, vi } from "vite-plus/test";

const h = vi.hoisted(() => ({
  dock: [] as string[],
  on: {} as Record<string, (e: { preventDefault(): void }) => void>,
  opts: undefined as Record<string, unknown> | undefined,
  bg: [] as string[],
  overlay: [] as number[],
}));
vi.mock("electron", () => ({
  app: {
    dock: { hide: () => h.dock.push("hide"), show: () => (h.dock.push("show"), Promise.resolve()) },
    quit: () => {},
  },
}));
vi.mock("./secure-window", () => ({
  createSecureWindow: (o: Record<string, unknown>) => (
    (h.opts = o),
    {
      on: (name: string, fn: (e: { preventDefault(): void }) => void) => void (h.on[name] = fn),
      once: () => {},
      loadFile: () => {},
      hide: () => {},
      show: () => {},
      focus: () => {},
      isDestroyed: () => false,
      isMinimized: () => false,
      isVisible: () => true,
      setTitleBarOverlay: (o: { height: number }) => h.overlay.push(o.height),
      setBackgroundColor: (c: string) => h.bg.push(c),
      setMinimumSize: () => {},
      setResizable: () => {},
      setContentSize: () => {},
      center: () => {},
    }
  ),
}));
vi.mock("./icon", () => ({ appIcon: () => undefined }));
vi.mock("./window-colors", () => ({ appBackground: () => "#grey", setupBackground: () => "#white", titleBarSymbol: () => "#000" }));

import { MainWindow } from "./main-window";
import type { Config } from "../shared/schemas";

const make = (setupDone = true, extra: { hideTray?: boolean; onCloseWithoutTray?: () => void } = {}) =>
  new MainWindow({ setupDone, labs: { "hide-tray-icon": !!extra.hideTray } } as unknown as Config, {
    onVisible: () => {},
    onHidden: () => {},
    ...(extra.onCloseWithoutTray && { onCloseWithoutTray: extra.onCloseWithoutTray }),
  });

describe("MainWindow and the macOS Dock", () => {
  it("closing the window hides the Dock icon and keeps the app alive", () => {
    h.dock.length = 0;
    const w = make();
    w.create(false);
    let prevented = false;
    h.on["close"]!({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    expect(h.dock).toEqual(["hide"]);
  });

  it("showing the window brings the Dock icon back", () => {
    h.dock.length = 0;
    const w = make();
    w.create(false);
    w.show();
    expect(h.dock).toEqual(["show"]);
  });

  it("launching hidden starts without a Dock icon", () => {
    h.dock.length = 0;
    make().create(true);
    expect(h.dock).toEqual(["hide"]);
  });

  it("a real quit lets the window close without touching the Dock", () => {
    h.dock.length = 0;
    const w = make();
    w.create(false);
    w.quitting = true;
    let prevented = false;
    h.on["close"]!({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(false);
    expect(h.dock).toEqual([]);
  });
});

describe("MainWindow close with the tray icon hidden", () => {
  const closeWith = (platform: NodeJS.Platform, hideTray: boolean) => {
    const real = process.platform;
    Object.defineProperty(process, "platform", { value: platform });
    try {
      h.dock.length = 0;
      let asked = 0;
      const w = make(true, { hideTray, onCloseWithoutTray: () => asked++ });
      w.create(false);
      let prevented = false;
      h.on["close"]!({ preventDefault: () => (prevented = true) });
      return { prevented, asked, dock: [...h.dock] };
    } finally {
      Object.defineProperty(process, "platform", { value: real });
    }
  };

  it("asks to quit instead of hiding a window nothing could bring back", () => {
    expect(closeWith("win32", true)).toEqual({ prevented: true, asked: 1, dock: [] });
  });
  it("still hides to the tray while the tray icon is shown", () => {
    expect(closeWith("win32", false)).toEqual({ prevented: true, asked: 0, dock: ["hide"] });
  });
  it("on macOS the Dock icon remains, so closing still hides the window", () => {
    expect(closeWith("darwin", true)).toEqual({ prevented: true, asked: 0, dock: ["hide"] });
  });
});

describe("MainWindow bar height and background", () => {
  it("the app window has a 38 px title bar on the window grey", () => {
    h.bg.length = h.overlay.length = 0;
    make().create(false);
    expect([h.opts?.["backgroundColor"], h.bg, h.overlay]).toEqual(["#grey", ["#grey"], [38]]);
  });

  it("the setup window has a 32 px title bar on white", () => {
    h.bg.length = h.overlay.length = 0;
    make(false).create(false);
    expect([h.opts?.["backgroundColor"], h.bg, h.overlay]).toEqual(["#white", ["#white"], [32]]);
  });
});
