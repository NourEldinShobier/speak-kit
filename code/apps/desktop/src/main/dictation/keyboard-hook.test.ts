import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createKeyboardHook, type HookBackend, type HookKey } from "./keyboard-hook";
import { VK, type HotkeyEvent } from "./types";

const MARKER = 0x53504b54;
const INJECTED = 0x10;

function setup(opts: { refuse?: boolean; pollMs?: number } = {}) {
  let onKey: ((k: HookKey) => boolean) | null = null;
  let onFault: ((e: unknown) => void) | null = null;
  let installs = 0;
  let removed = 0;
  const down = new Set<number>();
  const backend: HookBackend = {
    install(k, f) {
      if (opts.refuse) throw new Error("refused");
      installs++;
      onKey = k;
      onFault = f;
      return { uninstall: () => void removed++ };
    },
    keyIsDown: (vk) => down.has(vk),
  };
  let clock = 1000;
  const hook = createKeyboardHook(backend, { marker: MARKER, pollMs: opts.pollMs ?? 100, stallMs: 250, now: () => clock });
  const events: HotkeyEvent[] = [];
  const faults: unknown[] = [];
  const handlers = { onEvent: (e: HotkeyEvent) => void events.push(e), onFault: (e: unknown) => void faults.push(e) };
  const stroke = (vk: number, isDown: boolean, flags = 0, extra = 0) => onKey!({ vk, down: isDown, flags, extra });
  return {
    hook,
    handlers,
    events,
    faults,
    stroke,
    down,
    stats: () => ({ installs, removed }),
    fault: (e: unknown) => onFault!(e),
    advanceClock: (ms: number) => (clock += ms),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("keyboard hook", () => {
  it("answers swallow or pass at once and delivers events on a later turn", async () => {
    const t = setup();
    expect(t.hook.start({ keys: [VK.rightCtrl] }, t.handlers)).toEqual({ ok: true });
    expect(t.stroke(VK.rightCtrl, true)).toBe(true);
    expect(t.stroke(0x41, true)).toBe(false);
    expect(t.events).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "other", vk: 0x41 }]);
    expect(t.stroke(VK.rightCtrl, false)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events.at(-1)).toEqual({ kind: "up" });
  });

  it("ignores key events this app injected itself, but not other programs' injected keys", async () => {
    const t = setup();
    t.hook.start({ keys: [VK.rightCtrl] }, t.handlers);
    expect(t.stroke(VK.rightCtrl, true, INJECTED, MARKER)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([]);
    expect(t.stroke(VK.rightCtrl, true, INJECTED, 0)).toBe(true);
  });

  it("reports a refused hook and a second start", () => {
    expect(setup({ refuse: true }).hook.start({ keys: [VK.rightCtrl] }, { onEvent: () => {} })).toEqual({ ok: false, reason: "hook-failed" });
    const t = setup();
    t.hook.start({ keys: [VK.rightCtrl] }, t.handlers);
    expect(t.hook.start({ keys: [VK.rightCtrl] }, t.handlers)).toEqual({ ok: false, reason: "already-running" });
  });

  it("stop removes the hook once and drops events that were still queued", async () => {
    const t = setup();
    t.hook.start({ keys: [VK.rightCtrl] }, t.handlers);
    t.stroke(VK.rightCtrl, true);
    t.hook.stop();
    t.hook.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(t.stats().removed).toBe(1);
    expect(t.events).toEqual([]);
    expect(t.hook.active).toBe(false);
  });

  it("goes inactive when the hook reports a fault, tells the caller once, and can start again", async () => {
    const t = setup();
    t.hook.start({ keys: [VK.rightCtrl] }, t.handlers);
    const boom = new Error("callback threw");
    t.fault(boom);
    expect(t.faults).toEqual([boom]);
    expect(t.hook.active).toBe(false);
    expect(t.hook.start({ keys: [VK.rightCtrl] }, t.handlers)).toEqual({ ok: true });
    expect(t.stats().installs).toBe(2);
  });

  it("applies grab before start and while running", async () => {
    const t = setup();
    t.hook.grab([VK.escape]);
    t.hook.start({ keys: [VK.rightCtrl] }, t.handlers);
    expect(t.stroke(VK.escape, true)).toBe(true);
    t.hook.grab([]);
    expect(t.stroke(VK.escape, false)).toBe(true);
    expect(t.stroke(VK.escape, true)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "grabbed", vk: VK.escape }]);
  });
});

describe("safety timer", () => {
  it("releases a chord key that is up on the keyboard although the hook never saw the release", async () => {
    const t = setup();
    t.hook.start({ keys: [VK.leftCtrl, VK.space] }, t.handlers);
    t.stroke(VK.leftCtrl, true);
    t.stroke(VK.space, true);
    t.down.add(VK.leftCtrl);
    await vi.advanceTimersByTimeAsync(100);
    expect(t.events).toEqual([{ kind: "down" }]);
    t.down.delete(VK.leftCtrl);
    await vi.advanceTimersByTimeAsync(101);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "up" }]);
    await vi.advanceTimersByTimeAsync(500);
    expect(t.events).toHaveLength(2);
  });

  it("does not treat a swallowed key as stuck, because the system never records it as down", async () => {
    const t = setup();
    t.hook.start({ keys: [VK.rightCtrl] }, t.handlers);
    t.stroke(VK.rightCtrl, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.events).toEqual([{ kind: "down" }]);
  });

  it("reinstalls the hook after the event loop was blocked longer than the stall limit, and reports up for a chord whose release may have been lost", async () => {
    const t = setup();
    t.hook.start({ keys: [VK.rightCtrl] }, t.handlers);
    t.stroke(VK.rightCtrl, true);
    await vi.advanceTimersByTimeAsync(100);
    expect(t.stats()).toEqual({ installs: 1, removed: 0 });
    t.advanceClock(600);
    await vi.advanceTimersByTimeAsync(101);
    expect(t.stats()).toEqual({ installs: 2, removed: 1 });
    expect(t.events).toEqual([{ kind: "down" }, { kind: "up" }]);
    t.advanceClock(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(t.stats()).toEqual({ installs: 2, removed: 1 });
    expect(t.stroke(VK.rightCtrl, true)).toBe(true);
  });

  it("resync reports up for a chord that was down and forgets it", async () => {
    const t = setup();
    t.hook.start({ keys: [VK.rightCtrl] }, t.handlers);
    t.stroke(VK.rightCtrl, true);
    t.hook.resync();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "up" }]);
    expect(t.stroke(VK.rightCtrl, true)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events.at(-1)).toEqual({ kind: "down" });
  });
});
