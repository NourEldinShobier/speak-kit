import { describe, expect, it } from "vitest";
import { chunkPcm, createReopener, createSilenceWatch, fillGap, padTail, prerollMs, skipPauses, tailDone, trailingPadMs } from "../src/capture";

describe("prerollMs", () => {
  it("is 450 only when the microphone is kept ready and nothing is ducked", () => {
    expect(prerollMs({ keepReady: true, ducking: false })).toBe(450);
    expect(prerollMs({ keepReady: false, ducking: false })).toBe(0);
    expect(prerollMs({ keepReady: true, ducking: true })).toBe(0);
  });
});

describe("trailing pad", () => {
  it("pads 400 ms for Parakeet models only, and only when enabled", () => {
    expect(trailingPadMs("parakeet-tdt-0.6b-v3-q4_0", true)).toBe(400);
    expect(trailingPadMs("parakeet-tdt-0.6b-v3-q4_0", false)).toBe(0);
    expect(trailingPadMs("large-v3-turbo-q5_0", true)).toBe(0);
  });
  it("appends zeros after the speech", () => {
    const out = padTail(Float32Array.from([1, 2]), 1000, 3);
    expect(Array.from(out)).toEqual([1, 2, 0, 0, 0]);
    const same = Float32Array.from([1]);
    expect(padTail(same, 1000, 0)).toBe(same);
  });
});

describe("tailDone", () => {
  it("waits the minimum, then stops at once when silent", () => {
    expect(tailDone(199, false)).toBe(false);
    expect(tailDone(200, false)).toBe(true);
    expect(tailDone(200, undefined)).toBe(true);
  });
  it("extends while speech continues, up to 600 ms", () => {
    expect(tailDone(400, true)).toBe(false);
    expect(tailDone(599, true)).toBe(false);
    expect(tailDone(600, true)).toBe(true);
  });
});

describe("chunkPcm", () => {
  it("keeps a short take whole", () => {
    const pcm = new Float32Array(100);
    expect(chunkPcm(pcm, 1000, 1000)).toEqual([pcm]);
  });
  it("splits a long take into pieces that together hold every sample", () => {
    const pcm = Float32Array.from({ length: 2500 }, (_, i) => i);
    const parts = chunkPcm(pcm, 1000, 1000);
    expect(parts.map((p) => p.length)).toEqual([1000, 1000, 500]);
    expect(parts.flatMap((p) => Array.from(p))).toEqual(Array.from(pcm));
  });
  it("handles a 30 minute take at 16 kHz in 60 pieces", () => {
    const parts = chunkPcm(new Float32Array(16_000 * 1800), 16_000);
    expect(parts).toHaveLength(60);
  });
});

describe("silence watch", () => {
  it("reports one outage once, after 3 s of zeros, and again only after real audio", () => {
    const w = createSilenceWatch();
    expect(w.feed(true, 2900)).toBeUndefined();
    expect(w.feed(true, 100)).toBe("silent");
    expect(w.feed(true, 5000)).toBeUndefined();
    expect(w.feed(false, 80)).toBe("ok");
    expect(w.feed(false, 80)).toBeUndefined();
    expect(w.feed(true, 3000)).toBe("silent");
  });
  it("real audio resets the count", () => {
    const w = createSilenceWatch();
    w.feed(true, 2000);
    w.feed(false, 80);
    expect(w.feed(true, 2000)).toBeUndefined();
  });
});

describe("createReopener", () => {
  function rig(results: boolean[]) {
    const waits: number[] = [];
    const events: string[] = [];
    let pending: (() => void) | undefined;
    const reopener = createReopener({
      open: async () => results.shift() ?? false,
      after: (ms, fn) => {
        waits.push(ms);
        pending = fn;
        return () => (pending = undefined);
      },
      onEvent: (e) => events.push(e.type),
    });
    const fire = async () => {
      const fn = pending;
      pending = undefined;
      fn?.();
      await new Promise((r) => setTimeout(r, 0));
    };
    return { reopener, waits, events, fire };
  }

  it("backs off exponentially, reports the outage once and recovers", async () => {
    const r = rig([false, false, true]);
    r.reopener.run();
    r.reopener.run(); // a second call during the outage changes nothing
    await r.fire();
    await r.fire();
    await r.fire();
    expect(r.waits).toEqual([500, 1000, 2000]);
    expect(r.events).toEqual(["reopening", "recovered"]);
  });
  it("gives up with a named event after the limit", async () => {
    const r = rig([]);
    r.reopener.run();
    for (let i = 0; i < 8; i++) await r.fire();
    expect(r.events).toEqual(["reopening", "gave-up"]);
    expect(r.waits).toEqual([500, 1000, 2000, 4000, 8000, 8000]);
  });
  it("caps the wait", async () => {
    const r = rig([]);
    r.reopener.run();
    for (let i = 0; i < 6; i++) await r.fire();
    expect(Math.max(...r.waits)).toBe(8000);
  });
  it("cancel stops everything and a later run starts a new outage", async () => {
    const r = rig([true]);
    r.reopener.run();
    r.reopener.cancel();
    await r.fire();
    expect(r.events).toEqual(["reopening"]);
    r.reopener.run();
    await r.fire();
    expect(r.events).toEqual(["reopening", "reopening", "recovered"]);
  });
  it("a throwing open counts as a failed try", async () => {
    const events: string[] = [];
    let fn: (() => void) | undefined;
    const reopener = createReopener({
      open: () => Promise.reject(new Error("device gone")),
      after: (_ms, f) => {
        fn = f;
        return () => undefined;
      },
      onEvent: (e) => events.push(e.type),
      limit: 1,
    });
    reopener.run();
    fn?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(["reopening", "gave-up"]);
  });
});

describe("fillGap", () => {
  it("pads a gap under 200 ms and leaves a longer one", () => {
    expect(fillGap(Float32Array.from([1]), 100, 1000).length).toBe(101);
    expect(fillGap(Float32Array.from([1]), 200, 1000).length).toBe(1);
    expect(fillGap(Float32Array.from([1]), 0, 1000).length).toBe(1);
  });
});

describe("skipPauses", () => {
  const rate = 1000;
  const loud = (ms: number) => Float32Array.from({ length: ms }, (_, i) => (i % 2 ? 0.5 : -0.5));
  const quiet = (ms: number) => new Float32Array(ms);
  const join = (...parts: Float32Array[]) => {
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  it("keeps a short pause whole", () => {
    const pcm = join(loud(1000), quiet(2000), loud(1000));
    expect(skipPauses(pcm, rate)).toEqual({ pcm, droppedMs: 0 });
  });
  it("drops the middle of a long pause, keeping 0.3 s after and 2.5 s before", () => {
    const pcm = join(loud(1000), quiet(10_000), loud(1000));
    const r = skipPauses(pcm, rate);
    expect(r.droppedMs).toBe(10_000 - 300 - 2500);
    expect(r.pcm.length).toBe(pcm.length - r.droppedMs);
  });
  it("drops a long leading and trailing pause down to the margin on the speech side", () => {
    expect(skipPauses(join(quiet(10_000), loud(1000)), rate).droppedMs).toBe(10_000 - 2500);
    expect(skipPauses(join(loud(1000), quiet(10_000)), rate).droppedMs).toBe(10_000 - 300);
  });
  it("ignores a constant offset", () => {
    const flat = new Float32Array(10_000).fill(0.3);
    expect(skipPauses(join(loud(1000), flat, loud(1000)), rate).droppedMs).toBe(7200);
  });
  it("handles empty input", () => {
    expect(skipPauses(new Float32Array(0), rate)).toEqual({ pcm: new Float32Array(0), droppedMs: 0 });
  });
});
