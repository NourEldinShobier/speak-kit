import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createKeyboardHook, type HookBackend } from "./keyboard-hook";

const X1 = 0x05;

function setup() {
  let mouseInstalls = 0;
  let mouseRemoved = 0;
  let failMouse = false;
  let mouseFault: ((e: unknown) => void) | null = null;
  let clock = 1000;
  const backend: HookBackend = {
    install: () => ({ uninstall() {} }),
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
  hook.start({ keys: [0x78] }, { onEvent() {}, onFault: (e) => void faults.push(e) });
  hook.setExtraChords({ mouse: { keys: [X1] } });
  return {
    mouseInstalls: () => mouseInstalls,
    mouseRemoved: () => mouseRemoved,
    faults,
    fault: (e: unknown) => mouseFault!(e),
    failMouse: (v: boolean) => (failMouse = v),
    clock: (ms: number) => (clock += ms),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("mouse hook resilience", () => {
  it("installs the mouse hook again after the event loop was blocked", async () => {
    const t = setup();
    expect(t.mouseInstalls()).toBe(1);
    t.clock(1000);
    await vi.advanceTimersByTimeAsync(100);
    expect(t.mouseRemoved()).toBe(1);
    expect(t.mouseInstalls()).toBe(2);
  });

  it("reports a mouse hook fault to the owner and retries the hook at the next health check", async () => {
    const t = setup();
    t.fault(new Error("dropped"));
    expect(t.faults).toHaveLength(1);
    expect(t.mouseInstalls()).toBe(1);
    t.clock(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.mouseInstalls()).toBe(2);
  });

  it("keeps trying while the system refuses the mouse hook, without touching the keyboard hook", async () => {
    const t = setup();
    t.failMouse(true);
    t.fault(new Error("dropped"));
    t.clock(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.mouseInstalls()).toBe(1);
    t.failMouse(false);
    t.clock(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.mouseInstalls()).toBe(2);
    expect(t.faults).toHaveLength(1);
  });
});
