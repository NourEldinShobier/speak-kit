import { describe, expect, it } from "vite-plus/test";
import { MicState, METER_LEASE_MS } from "./mic-state";

function rig(enabled = true) {
  const calls: boolean[] = [];
  const timers: { ms: number; fn: () => void; live: boolean }[] = [];
  const state = new MicState(true, () => ({ devices: async () => undefined, configure: async (meter) => void calls.push(meter) }), {
    enabled: () => enabled,
    after: (ms, fn) => {
      const t = { ms, fn, live: true };
      timers.push(t);
      return () => (t.live = false);
    },
  });
  return { state, calls, timers, fire: () => timers.filter((t) => t.live).forEach((t) => t.fn()) };
}

describe("MicState meter", () => {
  it("opens the microphone for the meter once, however often the page renews", async () => {
    const r = rig();
    await r.state.setMeter(true);
    await r.state.setMeter(true);
    await r.state.setMeter(true);
    expect(r.calls).toEqual([true]);
    expect(r.state.meter).toBe(true);
  });

  it("does nothing while dictation is off", async () => {
    const r = rig(false);
    await r.state.setMeter(true);
    expect(r.calls).toEqual([]);
    expect(r.state.meter).toBe(false);
    expect(r.timers).toEqual([]);
  });

  it("switches the meter off when the page stops renewing it (hidden, reloaded or crashed)", async () => {
    const r = rig();
    await r.state.setMeter(true);
    expect(r.timers.at(-1)?.ms).toBe(METER_LEASE_MS);
    r.fire();
    await Promise.resolve();
    expect(r.calls).toEqual([true, false]);
    expect(r.state.meter).toBe(false);
  });

  it("a renewal restarts the lease and an explicit off cancels it", async () => {
    const r = rig();
    await r.state.setMeter(true);
    await r.state.setMeter(true);
    expect(r.timers.filter((t) => t.live)).toHaveLength(1);
    await r.state.setMeter(false);
    expect(r.timers.filter((t) => t.live)).toHaveLength(0);
    expect(r.calls).toEqual([true, false]);
  });

  it("reset (dictation turned off) drops the meter without touching the closed window", async () => {
    const r = rig();
    await r.state.setMeter(true);
    r.state.reset();
    expect(r.state.meter).toBe(false);
    expect(r.calls).toEqual([true]);
    await r.state.setMeter(true);
    expect(r.calls).toEqual([true, true]);
  });

  it("refresh sends the current meter state", async () => {
    const r = rig();
    await r.state.refresh();
    await r.state.setMeter(true);
    await r.state.refresh();
    expect(r.calls).toEqual([false, true, true]);
  });
});

describe("MicState events", () => {
  it("ends on 'back' after a reconnect: reopening, opened, then the reopener's own recovered report", () => {
    const r = rig();
    r.state.handle({ type: "reopening", attempt: 1 });
    expect(r.state.status).toEqual({ kind: "reconnecting", attempt: 1 });
    r.state.handle({ type: "opened", label: "Blue Yeti", bluetooth: false });
    expect(r.state.status).toEqual({ kind: "back", label: "Blue Yeti" });
  });
});
