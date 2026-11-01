import { describe, expect, it } from "vite-plus/test";
import { EngineNotReadyError, FakeEngine, type FakeEngineOptions } from "../src";

const synth = (e: FakeEngine, text = "hello", signal?: AbortSignal) => e.synthesize(text, { voice: "af_heart", speed: 1, signal });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 2000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout waiting for condition");
    await sleep(5);
  }
}
const lazy = (o: FakeEngineOptions = {}) => new FakeEngine({ state: "unloaded", ...o });

describe("lazy load", () => {
  it("holds nothing in memory until the first request, then loads once", async () => {
    const e = lazy({ loadMs: 20 });
    expect(e.status().state).toBe("unloaded");
    expect(e.loads).toBe(0);
    const r = await synth(e);
    expect(r.pcm.length).toBe(FakeEngine.sampleCount("hello", 1));
    expect(e.status().state).toBe("ready");
    expect(e.loads).toBe(1);
  });

  it("requests during loading wait for ready instead of failing, with a single load", async () => {
    const e = lazy({ loadMs: 80 });
    const states: string[] = [];
    e.onStatus((s) => states.push(s.state));
    const all = await Promise.all([synth(e, "a"), synth(e, "b"), synth(e, "c")]);
    expect(all.map((r) => r.pcm.length)).toEqual(["a", "b", "c"].map((t) => FakeEngine.sampleCount(t, 1)));
    expect(e.loads).toBe(1);
    expect(states).toEqual(["loading", "ready"]);
  });

  it("does not wait while missing or downloading", async () => {
    for (const state of ["missing", "downloading", "error"] as const) {
      const e = new FakeEngine({ state });
      await expect(synth(e)).rejects.toBeInstanceOf(EngineNotReadyError);
    }
  });

  it("abort while waiting for the load rejects with the reason and the load still completes", async () => {
    const e = lazy({ loadMs: 80 });
    const ac = new AbortController();
    const p = synth(e, "x", ac.signal);
    setTimeout(() => ac.abort(new Error("stop")), 10);
    await expect(p).rejects.toThrow("stop");
    await until(() => e.status().state === "ready");
    expect(e.loads).toBe(1);
  });
});

describe("warm", () => {
  it("is idempotent, never double-loads and makes the next request skip the load wait", async () => {
    const e = lazy({ loadMs: 60 });
    e.warm();
    e.warm();
    e.warm();
    expect(e.status().state).toBe("loading");
    await until(() => e.status().state === "ready");
    e.warm();
    expect(e.loads).toBe(1);
    const t0 = performance.now();
    await synth(e);
    expect(performance.now() - t0).toBeLessThan(40);
  });

  it("does not start a download when the model is missing", async () => {
    const e = new FakeEngine({ state: "missing" });
    e.warm();
    await sleep(20);
    expect(e.status().state).toBe("missing");
    expect(e.loads).toBe(0);
  });

  it("warm racing a request still loads once", async () => {
    const e = lazy({ loadMs: 40 });
    const p = synth(e);
    e.warm();
    await p;
    expect(e.loads).toBe(1);
  });
});

describe("idle unload", () => {
  it("unloads after the idle window and reloads on the next request", async () => {
    const e = lazy({ idleUnloadMs: 60 });
    await synth(e);
    expect(e.status().state).toBe("ready");
    await until(() => e.status().state === "unloaded");
    expect(e.unloads).toBe(1);
    await synth(e);
    expect(e.loads).toBe(2);
    expect(e.status().state).toBe("ready");
  });

  it("two reads right after an idle unload both succeed and share one reload", async () => {
    const e = lazy({ idleUnloadMs: 60, loadMs: 40 });
    await synth(e);
    await until(() => e.status().state === "unloaded");
    const first = synth(e, "first read");
    await sleep(10); // the second click lands while the model is still loading
    const second = synth(e, "second read");
    const [a, b] = await Promise.all([first, second]);
    expect(a.pcm.length).toBe(FakeEngine.sampleCount("first read", 1));
    expect(b.pcm.length).toBe(FakeEngine.sampleCount("second read", 1));
    expect(e.loads).toBe(2); // the first load plus a single reload
    expect(e.unloads).toBe(1);
    expect(e.status().state).toBe("ready");
  });

  it("reports the unload time and clears it once unloaded", async () => {
    const e = lazy({ idleUnloadMs: 5000 });
    expect(e.idleUnloadAtMs()).toBeUndefined();
    const before = Date.now();
    await synth(e);
    const at = e.idleUnloadAtMs()!;
    expect(at).toBeGreaterThanOrEqual(before + 5000);
    expect(at).toBeLessThan(Date.now() + 5001);
    e.setIdleUnloadMs(0);
    expect(e.idleUnloadAtMs()).toBeUndefined();
    await e.unload();
    expect(e.idleUnloadAtMs()).toBeUndefined();
  });

  it("0 means never", async () => {
    const e = lazy({ idleUnloadMs: 0 });
    await synth(e);
    await sleep(80);
    expect(e.status().state).toBe("ready");
  });

  it("the runtime setter changes the window of an already ready model", async () => {
    const e = lazy({ idleUnloadMs: 60_000 });
    await synth(e);
    e.setIdleUnloadMs(40);
    await until(() => e.status().state === "unloaded");
  });

  it("warm without a request unloads after the window", async () => {
    const e = lazy({ idleUnloadMs: 50 });
    e.warm();
    await until(() => e.status().state === "ready");
    await until(() => e.status().state === "unloaded");
    expect(e.loads).toBe(1);
  });

  it("an active stream blocks unload; releasing it restarts the window", async () => {
    const e = lazy({ idleUnloadMs: 40 });
    await synth(e);
    const end = e.beginStream();
    await sleep(150);
    expect(e.status().state).toBe("ready");
    expect(e.idleUnloadAtMs()).toBeUndefined();
    expect(await e.unload()).toBe(false);
    end();
    end(); // idempotent
    expect(e.idleUnloadAtMs()).toBeGreaterThan(Date.now() - 1);
    await until(() => e.status().state === "unloaded");
  });

  it("a synthesis in flight blocks unload", async () => {
    const e = lazy({ idleUnloadMs: 20, latencyMs: 120 });
    const p = synth(e);
    await sleep(100);
    expect(e.status().state).toBe("ready");
    await p;
    expect(e.unloads).toBe(0);
    await until(() => e.status().state === "unloaded");
  });

  it("each synthesis restarts the window", async () => {
    const e = lazy({ idleUnloadMs: 100 });
    for (let i = 0; i < 4; i++) {
      await synth(e);
      await sleep(50);
    }
    expect(e.status().state).toBe("ready");
    expect(e.loads).toBe(1);
  });
});

describe("hold while paused", () => {
  it("keeps the model past the idle window until the hold ends", async () => {
    const e = lazy({ idleUnloadMs: 30 });
    await synth(e);
    e.hold(250);
    await sleep(150);
    expect(e.status().state).toBe("ready");
    await until(() => e.status().state === "unloaded");
    expect(e.unloads).toBe(1);
  });

  it("hold(0) releases it so the normal window applies", async () => {
    const e = lazy({ idleUnloadMs: 30 });
    await synth(e);
    e.hold(60_000);
    await sleep(100);
    expect(e.status().state).toBe("ready");
    e.hold(0);
    await until(() => e.status().state === "unloaded");
  });
});

describe("battery and memory pressure", () => {
  it("uses the short window on battery", async () => {
    const e = lazy({ idleUnloadMs: 60_000, batteryIdleMs: 40 });
    await synth(e);
    expect(e.idleUnloadAtMs()! - Date.now()).toBeGreaterThan(50_000);
    e.setOnBattery(true);
    expect(e.idleUnloadAtMs()! - Date.now()).toBeLessThan(100);
    await until(() => e.status().state === "unloaded");
  });

  it("does not shorten an infinite window on battery", async () => {
    const e = lazy({ idleUnloadMs: 0, batteryIdleMs: 20, onBattery: true });
    await synth(e);
    await sleep(80);
    expect(e.status().state).toBe("ready");
  });

  it("unloads early when free memory is under the threshold, after the grace period", async () => {
    let free = 8 * 1024 ** 3;
    const e = lazy({
      idleUnloadMs: 60_000,
      freemem: () => free,
      lowMemBytes: 1024 ** 3,
      lowMemGraceMs: 60,
      checkIntervalMs: 15,
    });
    await synth(e);
    await sleep(120);
    expect(e.status().state).toBe("ready"); // plenty of memory
    free = 512 * 1024 ** 2;
    await until(() => e.status().state === "unloaded");
  });

  it("low memory never unloads under an active stream", async () => {
    const e = lazy({
      idleUnloadMs: 60_000,
      freemem: () => 1,
      lowMemGraceMs: 0,
      checkIntervalMs: 10,
    });
    await synth(e);
    const end = e.beginStream();
    await sleep(80);
    expect(e.status().state).toBe("ready");
    end();
  });
});

describe("close", () => {
  it("unloads and stops timers", async () => {
    const e = lazy({ idleUnloadMs: 20 });
    await synth(e);
    await e.close();
    expect(e.unloads).toBe(1);
  });
});
