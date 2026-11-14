import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createHud, type HudState, type HudWindow } from "./hud";

function fakeWindow() {
  const log: string[] = [];
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const ready = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
  const w: HudWindow & { log: string[]; load(): void; fail(): void } = {
    ready,
    destroyed: false,
    log,
    push: (s: HudState) => void log.push(`push ${JSON.stringify(s)}`),
    showInactive: (place) => void log.push(place === "top" ? "show top" : "show"),
    hide: () => void log.push("hide"),
    destroy() {
      log.push("destroy");
      (w as { destroyed: boolean }).destroyed = true;
    },
    load: () => resolve(),
    fail: () => reject(new Error("load failed")),
  };
  return w;
}

function setup(idleMs = 1000) {
  const windows: ReturnType<typeof fakeWindow>[] = [];
  const hud = createHud({
    open: () => {
      const w = fakeWindow();
      windows.push(w);
      return w;
    },
    idleMs,
  });
  return { hud, windows };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("hud window place", () => {
  it("shows the window where the setting says at the time of the show", async () => {
    let place: "top" | "bottom" = "top";
    const windows: ReturnType<typeof fakeWindow>[] = [];
    const hud = createHud({ open: () => (windows[windows.length] = fakeWindow()), place: () => place });
    hud.show({ kind: "recording", level: 0 });
    windows[0]!.load();
    await flush();
    expect(windows[0]!.log).toContain("show top");
    hud.hide();
    place = "bottom";
    hud.show({ kind: "recording", level: 0 });
    await flush();
    expect(windows[0]!.log.filter((l) => l.startsWith("show"))).toEqual(["show top", "show"]);
  });
});

describe("hud window lifecycle", () => {
  it("creates nothing until the first show", () => {
    const { hud, windows } = setup();
    expect(windows).toHaveLength(0);
    expect(hud.exists).toBe(false);
  });

  it("shows the latest state without activating once the page has loaded", async () => {
    const { hud, windows } = setup();
    hud.show({ kind: "recording", level: 0.1 });
    hud.update({ kind: "recording", level: 0.5 });
    expect(windows[0]!.log).toEqual([]);
    windows[0]!.load();
    await flush();
    expect(windows[0]!.log).toEqual(['push {"kind":"recording","level":0.5}', "show"]);
    hud.update({ kind: "transcribing" });
    expect(windows[0]!.log.slice(2)).toEqual(['push {"kind":"transcribing"}']);
  });

  it("does not show a window that was hidden before its page loaded", async () => {
    const { hud, windows } = setup();
    hud.show({ kind: "transcribing" });
    hud.hide();
    windows[0]!.load();
    await flush();
    expect(windows[0]!.log).toEqual(["hide"]);
  });

  it("ignores updates while hidden", async () => {
    const { hud, windows } = setup();
    hud.show({ kind: "transcribing" });
    windows[0]!.load();
    await flush();
    hud.hide();
    hud.update({ kind: "recording", level: 1 });
    expect(windows[0]!.log).toEqual(['push {"kind":"transcribing"}', "show", "hide"]);
  });

  it("reuses the window for a dictation that starts before the idle time and destroys it after the idle time", async () => {
    const { hud, windows } = setup(1000);
    hud.show({ kind: "transcribing" });
    windows[0]!.load();
    await flush();
    hud.hide();
    await vi.advanceTimersByTimeAsync(999);
    expect(hud.exists).toBe(true);
    hud.show({ kind: "recording", level: 0 });
    await flush();
    expect(windows).toHaveLength(1);
    expect(windows[0]!.log.filter((l) => l === "show")).toHaveLength(2);
    hud.hide();
    await vi.advanceTimersByTimeAsync(1000);
    expect(hud.exists).toBe(false);
    expect(windows[0]!.log.at(-1)).toBe("destroy");
  });

  it("creates a fresh window after the old one was destroyed", async () => {
    const { hud, windows } = setup(1000);
    hud.show({ kind: "transcribing" });
    windows[0]!.load();
    await flush();
    hud.hide();
    await vi.advanceTimersByTimeAsync(1000);
    hud.show({ kind: "transcribing" });
    expect(windows).toHaveLength(2);
    windows[1]!.load();
    await flush();
    expect(windows[1]!.log).toEqual(['push {"kind":"transcribing"}', "show"]);
  });

  it("drops a window whose page failed to load, and opens a new one on the next show", async () => {
    const { hud, windows } = setup();
    hud.show({ kind: "transcribing" });
    windows[0]!.fail();
    await flush();
    expect(hud.exists).toBe(false);
    hud.show({ kind: "transcribing" });
    expect(windows).toHaveLength(2);
  });

  it("dispose destroys at once and stops the idle timer", async () => {
    const { hud, windows } = setup();
    hud.show({ kind: "transcribing" });
    windows[0]!.load();
    await flush();
    hud.hide();
    hud.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(windows[0]!.log.filter((l) => l === "destroy")).toHaveLength(1);
  });
});
