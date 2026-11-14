import { describe, expect, it } from "vitest";
import { classifyOutput, createDucker, shouldDuck, type DuckMode, type OutputKind } from "../src/ducking";

describe("classifyOutput", () => {
  it("separates headphones from speakers and treats the rest as unknown", () => {
    expect(classifyOutput("Headphones (Realtek)")).toBe("headphones");
    expect(classifyOutput("WH-1000XM4 Hands-Free")).toBe("headphones");
    expect(classifyOutput("Speakers (Realtek)")).toBe("speakers");
    expect(classifyOutput("MacBook Pro Speakers builtin")).toBe("speakers");
    expect(classifyOutput("Output builtin")).toBe("speakers");
    expect(classifyOutput("Some DAC")).toBe("unknown");
    expect(classifyOutput(undefined)).toBe("unknown");
  });
});

describe("shouldDuck", () => {
  it("never for nothing or headphones; unknown counts as speakers", () => {
    expect(shouldDuck("nothing", "speakers")).toBe(false);
    expect(shouldDuck("pause", "headphones")).toBe(false);
    expect(shouldDuck("pause", "unknown")).toBe(true);
    expect(shouldDuck("lower", "speakers")).toBe(true);
  });
});

function rig(mode: DuckMode, o: { playing?: boolean; volume?: number; muted?: boolean; output?: OutputKind; fail?: boolean } = {}) {
  const calls: string[] = [];
  const fail = async () => {
    if (o.fail) throw new Error("refused");
  };
  const ducker = createDucker({
    mode: () => mode,
    output: async () => o.output ?? "speakers",
    media: {
      playing: async () => o.playing ?? true,
      pause: async () => (calls.push("pause"), fail()),
      play: async () => void calls.push("play"),
    },
    volume: {
      get: async () => o.volume ?? 0.8,
      ramp: async (to, ms) => void calls.push(`ramp ${to} ${ms}`),
      muted: async () => o.muted ?? false,
      setMuted: async (on) => void calls.push(`muted ${on}`),
    },
  });
  return { ducker, calls };
}

describe("createDucker", () => {
  it("pauses only what is playing and resumes only what it paused", async () => {
    const a = rig("pause");
    await a.ducker.begin();
    await a.ducker.end();
    expect(a.calls).toEqual(["pause", "play"]);
    const idle = rig("pause", { playing: false });
    await idle.ducker.begin();
    await idle.ducker.end();
    expect(idle.calls).toEqual([]);
  });
  it("lowers in 120 ms and restores to the old volume in 1 s", async () => {
    const r = rig("lower", { volume: 0.8 });
    await r.ducker.begin();
    await r.ducker.end();
    expect(r.calls).toEqual(["ramp 0.2 120", "ramp 0.8 1000"]);
  });
  it("does not raise a volume that is already lower than the target", async () => {
    const r = rig("lower", { volume: 0.1 });
    await r.ducker.begin();
    expect(r.calls).toEqual(["ramp 0.1 120"]);
  });
  it("mutes and unmutes, but leaves an existing mute alone", async () => {
    const r = rig("mute");
    await r.ducker.begin();
    await r.ducker.end();
    expect(r.calls).toEqual(["muted true", "muted false"]);
    const already = rig("mute", { muted: true });
    await already.ducker.begin();
    await already.ducker.end();
    expect(already.calls).toEqual([]);
  });
  it("does nothing for headphones or the nothing mode", async () => {
    for (const r of [rig("pause", { output: "headphones" }), rig("nothing")]) {
      await r.ducker.begin();
      await r.ducker.end();
      expect(r.calls).toEqual([]);
    }
  });
  it("end is safe to call twice and without begin", async () => {
    const r = rig("pause");
    await r.ducker.end();
    await r.ducker.begin();
    await r.ducker.begin(); // a second begin while active changes nothing
    await r.ducker.end();
    await r.ducker.end();
    expect(r.calls).toEqual(["pause", "play"]);
  });
  it("a refused pause does not throw and nothing is resumed", async () => {
    const r = rig("pause", { fail: true });
    await r.ducker.begin();
    await r.ducker.end();
    expect(r.calls).toEqual(["pause"]);
  });
  it("a failing output lookup counts as speakers", async () => {
    const calls: string[] = [];
    const d = createDucker({
      mode: () => "pause",
      output: () => Promise.reject(new Error("no device")),
      media: { playing: async () => true, pause: async () => void calls.push("pause"), play: async () => void calls.push("play") },
      volume: undefined,
    });
    await d.begin();
    await d.end();
    expect(calls).toEqual(["pause", "play"]);
  });
  it("without a media session or volume control the mode is a no-op", async () => {
    const d = createDucker({ mode: () => "lower", output: async () => "speakers", media: undefined, volume: undefined });
    await d.begin();
    await d.end();
  });
  it("puts audio back when the key is released while the system is still being asked", async () => {
    const muted: boolean[] = [];
    let release: () => void = () => undefined;
    const ducker = createDucker({
      mode: () => "mute",
      output: async () => "speakers",
      media: undefined,
      volume: {
        get: async () => 0.5,
        ramp: async () => undefined,
        muted: async () => false,
        setMuted: (on) => new Promise<void>((resolve) => ((release = () => (muted.push(on), resolve())), undefined)),
      },
    });
    const begun = ducker.begin();
    await new Promise((r) => setImmediate(r));
    const ended = ducker.end();
    release();
    await begun;
    release();
    await ended;
    expect(muted).toEqual([true, false]);
  });
  it("a second begin while the first is still running does not duck twice", async () => {
    const r = rig("mute");
    await Promise.all([r.ducker.begin(), r.ducker.begin()]);
    await r.ducker.end();
    expect(r.calls).toEqual(["muted true", "muted false"]);
  });
});
