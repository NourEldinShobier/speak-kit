import { describe, expect, it, vi } from "vite-plus/test";

const h = vi.hoisted(() => ({ dock: [] as string[], on: {} as Record<string, (e: { preventDefault(): void }) => void> }));
vi.mock("electron", () => ({
  app: {
    dock: { hide: () => h.dock.push("hide"), show: () => (h.dock.push("show"), Promise.resolve()) },
    quit: () => {},
  },
}));
vi.mock("./secure-window", () => ({
  createSecureWindow: () => ({
    on: (name: string, fn: (e: { preventDefault(): void }) => void) => void (h.on[name] = fn),
    once: () => {},
    loadFile: () => {},
    hide: () => {},
    show: () => {},
    focus: () => {},
    isDestroyed: () => false,
    isMinimized: () => false,
    isVisible: () => true,
    setTitleBarOverlay: () => {},
    setMinimumSize: () => {},
    setResizable: () => {},
    setContentSize: () => {},
    center: () => {},
  }),
}));
vi.mock("./icon", () => ({ appIcon: () => undefined }));
vi.mock("./window-colors", () => ({ appBackground: () => "#fff", titleBarSymbol: () => "#000" }));

import { MainWindow } from "./main-window";
import type { Config } from "../shared/schemas";

const make = () => new MainWindow({ setupDone: true } as Config, { onVisible: () => {}, onHidden: () => {} });

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
