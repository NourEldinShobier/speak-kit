import { describe, expect, it } from "vite-plus/test";
import { RENEW_MS, watchMeter } from "./meter-watch";

function rig(visible = true, focused = true) {
  const calls: boolean[] = [];
  const handlers = new Map<string, () => void>();
  const doc = {
    visibilityState: visible ? "visible" : "hidden",
    hasFocus: () => focused,
    addEventListener: (t: string, f: () => void) => handlers.set(t, f),
    removeEventListener: (t: string) => handlers.delete(t),
  };
  let tick: (() => void) | undefined;
  let cleared = false;
  const win = {
    addEventListener: (t: string, f: () => void) => handlers.set(t, f),
    removeEventListener: (t: string) => handlers.delete(t),
    setInterval: (f: () => void, ms: number) => ((tick = f), ms),
    clearInterval: () => (cleared = true),
  };
  const api = { micMeter: async (on: boolean) => void calls.push(on) };
  return {
    calls,
    handlers,
    tick: () => tick?.(),
    cleared: () => cleared,
    set: (v: boolean, f: boolean) => {
      doc.visibilityState = v ? "visible" : "hidden";
      focused = f;
    },
    stop: watchMeter(api, doc, win),
  };
}

describe("watchMeter", () => {
  it("turns the meter on only while the window is visible and focused", () => {
    const r = rig();
    expect(r.calls).toEqual([true]);
    r.set(false, true);
    r.handlers.get("visibilitychange")?.();
    expect(r.calls).toEqual([true, false]);
    r.set(true, false);
    r.handlers.get("blur")?.();
    expect(r.calls).toEqual([true, false]);
    r.set(true, true);
    r.handlers.get("focus")?.();
    expect(r.calls).toEqual([true, false, true]);
  });

  it("never opens it for a hidden page", () => {
    const r = rig(false);
    r.tick();
    expect(r.calls).toEqual([]);
  });

  it("renews every few seconds while on", () => {
    const r = rig();
    r.tick();
    expect(r.calls).toEqual([true, true]);
    expect(RENEW_MS).toBeLessThan(15_000);
  });

  it("switches it off and detaches when the page goes away", () => {
    const r = rig();
    r.stop();
    expect(r.calls).toEqual([true, false]);
    expect(r.handlers.size).toBe(0);
    expect(r.cleared()).toBe(true);
  });
});
