import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createChordTracker } from "./chord-tracker";
import { createKeyboardHook, trackerCode, type HookBackend, type HookClick, type HookKey } from "./keyboard-hook";
import { buttonOf } from "./windows/mouse-hook";
import { EXTENDED, VK, type HotkeyEvent } from "./types";

const MARKER = 0x53504b54;
const INJECTED = 0x10;
const EXT = 0x01;
const A = 0x41;
const V = 0x56;
const HOME = 0x24;
const F9 = 0x78;

function rig(opts: { mouse?: boolean; healthMs?: number } = {}) {
  let onKey: ((k: HookKey) => boolean) | null = null;
  let onClick: ((c: HookClick) => boolean) | null = null;
  let installs = 0;
  let mouseInstalls = 0;
  let mouseRemoved = 0;
  let masks = 0;
  const down = new Set<number>();
  const backend: HookBackend = {
    install(k) {
      installs++;
      onKey = k;
      return { uninstall: () => undefined };
    },
    keyIsDown: (vk) => down.has(vk),
    injectMask: () => void masks++,
    ...(opts.mouse && {
      installMouse(c) {
        mouseInstalls++;
        onClick = c;
        return { uninstall: () => void mouseRemoved++ };
      },
    }),
  };
  let clock = 1000;
  const hook = createKeyboardHook(backend, { marker: MARKER, pollMs: 100, stallMs: 250, healthMs: opts.healthMs ?? 5000, clickWatchMs: 800, now: () => clock });
  const events: HotkeyEvent[] = [];
  const handlers = { onEvent: (e: HotkeyEvent) => void events.push(e) };
  return {
    hook,
    handlers,
    events,
    down,
    key: (vk: number, isDown: boolean, flags = 0, extra = 0) => onKey!({ vk, down: isDown, flags, extra }),
    click: (vk: number, isDown: boolean) => onClick!({ vk, down: isDown, extra: 0, flags: 0 }),
    stats: () => ({ installs, mouseInstalls, mouseRemoved, masks }),
    tick: async (ms: number) => {
      for (let left = ms; left > 0; left -= 100) {
        clock += Math.min(100, left);
        await vi.advanceTimersByTimeAsync(Math.min(100, left));
      }
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("lone-modifier menu mask", () => {
  it("injects the mask when a lone Alt is released, so no menu opens", async () => {
    const r = rig();
    r.hook.start({ keys: [VK.rightAlt] }, r.handlers);
    r.key(VK.rightAlt, true);
    expect(r.stats().masks).toBe(0);
    r.key(VK.rightAlt, false);
    expect(r.stats().masks).toBe(1);
  });

  it("does the same for the Windows key and for an Alt chord with a key, also when the key goes up first", async () => {
    const win = rig();
    win.hook.start({ keys: [VK.leftWin] }, win.handlers);
    win.key(VK.leftWin, true);
    win.key(VK.leftWin, false);
    expect(win.stats().masks).toBe(1);
    const alt = rig();
    alt.hook.start({ keys: [VK.leftAlt, 0x30] }, alt.handlers);
    alt.key(VK.leftAlt, true);
    expect(alt.key(0x30, true)).toBe(true);
    alt.key(0x30, false);
    expect(alt.stats().masks).toBe(0);
    alt.key(VK.leftAlt, false);
    expect(alt.stats().masks).toBe(1);
  });

  it("does not inject for Ctrl or for keys that were never part of a dictation press", () => {
    const r = rig();
    r.hook.start({ keys: [VK.rightCtrl] }, r.handlers);
    r.key(VK.rightCtrl, true);
    r.key(VK.rightCtrl, false);
    r.key(VK.leftAlt, true);
    r.key(VK.leftAlt, false);
    expect(r.stats().masks).toBe(0);
  });

  it("ignores its own injected mask keys", () => {
    const r = rig();
    r.hook.start({ keys: [0xe8] }, r.handlers);
    expect(r.key(0xe8, true, INJECTED, MARKER)).toBe(false);
  });
});

describe("several chords", () => {
  it("tags events of an extra chord with its name and swallows its key", async () => {
    const r = rig();
    r.hook.start({ keys: [F9] }, r.handlers);
    r.hook.setExtraChords({ pasteLast: { keys: [VK.leftCtrl, VK.leftAlt, V] } });
    r.key(VK.leftCtrl, true);
    r.key(VK.leftAlt, true);
    expect(r.key(V, true)).toBe(true);
    expect(r.key(V, false)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.events.filter((e) => e.kind === "down" || e.kind === "up")).toEqual([
      { kind: "down", chord: "pasteLast" },
      { kind: "up", chord: "pasteLast" },
    ]);
  });

  it("lets a shared chord reach the app too", () => {
    const r = rig();
    r.hook.start({ keys: [F9], share: true }, r.handlers);
    expect(r.key(F9, true)).toBe(false);
    expect(r.key(F9, false)).toBe(false);
  });

  it("takes a new set of chords while running, and drops the old ones", async () => {
    const r = rig();
    r.hook.start({ keys: [VK.rightCtrl] }, r.handlers);
    r.hook.setExtraChords({ raw: { keys: [F9] } });
    expect(r.key(F9, true)).toBe(true);
    r.key(F9, false);
    r.hook.setExtraChords({});
    expect(r.key(F9, true)).toBe(false);
  });
});

describe("navigation keys", () => {
  it("matches the dedicated Home key by the extended flag and not the numpad key with Num Lock off", async () => {
    expect(trackerCode(HOME, EXT)).toBe(HOME + EXTENDED);
    expect(trackerCode(HOME, 0)).toBe(HOME);
    const r = rig();
    r.hook.start({ keys: [HOME + EXTENDED] }, r.handlers);
    expect(r.key(HOME, true, 0)).toBe(false);
    expect(r.key(HOME, false, 0)).toBe(false);
    expect(r.key(HOME, true, EXT)).toBe(true);
    expect(r.key(HOME, false, EXT)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.events).toEqual([{ kind: "down" }, { kind: "up" }]);
  });
});

describe("mouse buttons", () => {
  it("installs the mouse hook only while a button is bound", () => {
    const r = rig({ mouse: true });
    r.hook.start({ keys: [F9] }, r.handlers);
    expect(r.stats().mouseInstalls).toBe(0);
    r.hook.setExtraChords({ mouse: { keys: [0x05] } });
    expect(r.stats().mouseInstalls).toBe(1);
    r.hook.setExtraChords({});
    expect(r.stats().mouseRemoved).toBe(1);
  });

  it("swallows the button down and up as a pair and reports the chord", async () => {
    const r = rig({ mouse: true });
    r.hook.start({ keys: [F9] }, r.handlers);
    r.hook.setExtraChords({ mouse: { keys: [0x05] } });
    expect(r.click(0x05, true)).toBe(true);
    expect(r.click(0x05, false)).toBe(true);
    expect(r.click(0x06, true)).toBe(false);
    expect(r.click(0x06, false)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.events.filter((e) => e.kind === "down" || e.kind === "up")).toEqual([
      { kind: "down", chord: "mouse" },
      { kind: "up", chord: "mouse" },
    ]);
  });

  it("falls back to the keyboard when the platform has no mouse hook", () => {
    const r = rig();
    r.hook.start({ keys: [F9] }, r.handlers);
    r.hook.setExtraChords({ mouse: { keys: [0x05] } });
    expect(r.hook.mouse).toBe(false);
  });

  it("watches clicks briefly after a release so a click between two taps cancels the lock, then lets the hook go", async () => {
    const r = rig({ mouse: true });
    r.hook.start({ keys: [VK.rightCtrl] }, r.handlers);
    r.key(VK.rightCtrl, true);
    r.key(VK.rightCtrl, false);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.stats().mouseInstalls).toBe(1);
    expect(r.click(0x01, true)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.events.at(-1)).toEqual({ kind: "other", vk: 0x01 });
    await r.tick(1000);
    expect(r.stats().mouseRemoved).toBe(1);
  });
});

describe("repair after lock or sleep", () => {
  it("releases a chord key that is up on the real keyboard, and never reports a press for one that is down", async () => {
    const r = rig();
    r.hook.start({ keys: [VK.leftWin] }, r.handlers);
    r.key(VK.leftWin, true);
    r.hook.resync();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.events).toEqual([{ kind: "down" }, { kind: "up" }]);
    r.events.length = 0;
    r.down.add(VK.leftWin);
    r.hook.resync();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.events).toEqual([]);
  });

  it("a fresh press after a missed release reports a new press", async () => {
    const r = rig();
    r.hook.start({ keys: [VK.leftWin] }, r.handlers);
    r.key(VK.leftWin, true); // the lock screen then hides the release
    r.hook.resync();
    r.key(VK.leftWin, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.events.map((e) => e.kind)).toEqual(["down", "up", "down"]);
  });

  it("reinstalls the hook when the health check finds a chord key down that the hook never saw", async () => {
    const r = rig({ healthMs: 5000 });
    r.hook.start({ keys: [VK.rightCtrl] }, r.handlers);
    expect(r.stats().installs).toBe(1);
    r.down.add(VK.rightCtrl);
    await r.tick(5100);
    expect(r.stats().installs).toBe(2);
  });

  it("leaves the hook alone when the keyboard and the hook agree", async () => {
    const r = rig({ healthMs: 5000 });
    r.hook.start({ keys: [VK.rightCtrl] }, r.handlers);
    await r.tick(12_000);
    expect(r.stats().installs).toBe(1);
  });

  it("reports whether any key is down", () => {
    const r = rig();
    expect(r.hook.anyKeyDown()).toBe(false);
    r.down.add(A);
    expect(r.hook.anyKeyDown()).toBe(true);
  });
});

describe("mouse messages", () => {
  it("reduces button messages to codes and ignores moves and the wheel", () => {
    expect(buttonOf(0x204, 0)).toEqual({ vk: 0x02, down: true });
    expect(buttonOf(0x208, 0)).toEqual({ vk: 0x04, down: false });
    expect(buttonOf(0x20b, 1 << 16)).toEqual({ vk: 0x05, down: true });
    expect(buttonOf(0x20c, 2 << 16)).toEqual({ vk: 0x06, down: false });
    expect(buttonOf(0x20b, 3 << 16)).toBeUndefined();
    expect(buttonOf(0x200, 0)).toBeUndefined();
    expect(buttonOf(0x20a, 0)).toBeUndefined();
  });
});

describe("chord tracker, lone modifier counting", () => {
  const down = (vk: number) => ({ vk, down: true });
  const up = (vk: number) => ({ vk, down: false });

  it("does not count a modifier pressed while another key is already down", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    t.feed(down(A));
    expect(t.feed(down(VK.rightCtrl))).toEqual({ swallow: false, events: [] });
    expect(t.feed(up(VK.rightCtrl))).toEqual({ swallow: false, events: [] });
    expect(t.active).toBe(false);
  });

  it("counts a press again once everything was released", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    t.feed(down(A));
    t.feed(down(VK.rightCtrl));
    t.feed(up(VK.rightCtrl));
    t.feed(up(A));
    expect(t.feed(down(VK.rightCtrl)).events).toEqual([{ kind: "down" }]);
  });

  it("does not count Shift, Caps Lock or the other side of the key", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    expect(t.feed(down(VK.leftCtrl)).events).toEqual([]);
    expect(t.feed(down(VK.leftShift)).events).toEqual([]);
    expect(t.feed(down(VK.capsLock)).events).toEqual([]);
    expect(t.feed(up(VK.leftShift)).events).toEqual([]);
  });

  it("reports the first other key after a release once, so an armed double-tap can end", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    t.feed(down(VK.rightCtrl));
    t.feed(up(VK.rightCtrl));
    expect(t.feed(down(A)).events).toEqual([{ kind: "other", vk: A }]);
    t.feed(up(A));
    expect(t.feed(down(0x42)).events).toEqual([]);
  });
});
