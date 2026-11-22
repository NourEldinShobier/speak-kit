import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createKeyboardHook, type HookBackend, type HookKey } from "./keyboard-hook";

const F9 = 0x78;

/** Starts the hook on F9 and holds it, which is when the mouse hook is wanted. */
async function setup() {
  let onKey: ((k: HookKey) => boolean) | null = null;
  let mouseInstalls = 0;
  let mouseRemoved = 0;
  let failMouse = false;
  let mouseFault: ((e: unknown) => void) | null = null;
  let clock = 1000;
  const backend: HookBackend = {
    install(k) {
      onKey = k;
      return { uninstall() {} };
    },
    keyIsDown: () => false,
    installMouse(_click, onFault) {
      if (failMouse) throw new Error("no mouse hook");
      mouseInstalls++;
      mouseFault = onFault;
      return { uninstall: () => void mouseRemoved++ };
    },
  };
  const hook = createKeyboardHook(backend, { marker: 1, pollMs: 100, stallMs: 250, healthMs: 5000, now: () => clock });
  const faults: unknown[] = [];
  hook.start({ keys: [F9] }, { onEvent() {}, onFault: (e) => void faults.push(e) });
  onKey!({ vk: F9, down: true, flags: 0, extra: 0 });
  await vi.advanceTimersByTimeAsync(0);
  return {
    mouseInstalls: () => mouseInstalls,
    mouseRemoved: () => mouseRemoved,
    faults,
    fault: (e: unknown) => mouseFault!(e),
    failMouse: (v: boolean) => (failMouse = v),
    clock: (ms: number) => (clock += ms),
    /** Time passes in poll steps, so the event loop never looks blocked. */
    tick: async (ms: number) => {
      for (let left = ms; left > 0; left -= 100) {
        clock += 100;
        await vi.advanceTimersByTimeAsync(100);
      }
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("mouse hook resilience", () => {
  it("installs the mouse hook again after the event loop was blocked", async () => {
    const t = await setup();
    expect(t.mouseInstalls()).toBe(1);
    t.clock(1000);
    await vi.advanceTimersByTimeAsync(100);
    expect(t.mouseRemoved()).toBe(1);
    expect(t.mouseInstalls()).toBe(2);
  });

  it("reports a mouse hook fault to the owner and retries the hook at the next health check", async () => {
    const t = await setup();
    t.fault(new Error("dropped"));
    expect(t.faults).toHaveLength(1);
    expect(t.mouseInstalls()).toBe(1);
    await t.tick(5100);
    expect(t.mouseInstalls()).toBe(2);
  });

  it("keeps trying while the key is held and the system refuses the mouse hook, without touching the keyboard hook", async () => {
    const t = await setup();
    t.failMouse(true);
    t.fault(new Error("dropped"));
    await t.tick(5100);
    expect(t.mouseInstalls()).toBe(1);
    t.failMouse(false);
    await t.tick(5100);
    expect(t.mouseInstalls()).toBe(2);
    expect(t.faults).toHaveLength(1);
  });
});
