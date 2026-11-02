import { describe, expect, it } from "vite-plus/test";
import { EngineNotReadyError, FakeEngine, KOKORO_VOICES } from "../src";

describe("FakeEngine", () => {
  it("is deterministic and length is proportional to chars and inverse to speed", async () => {
    const e = new FakeEngine();
    const a = await e.synthesize("a".repeat(100), { voice: "af_heart", speed: 1 });
    const b = await e.synthesize("a".repeat(100), { voice: "af_heart", speed: 1 });
    const c = await e.synthesize("a".repeat(200), { voice: "af_heart", speed: 1 });
    const d = await e.synthesize("a".repeat(100), { voice: "af_heart", speed: 2 });
    expect(a.sampleRate).toBe(24000);
    expect(a.pcm.length).toBe(144000); // 100 chars * 0.06 s * 24000
    expect(Array.from(a.pcm.slice(0, 50))).toEqual(Array.from(b.pcm.slice(0, 50)));
    expect(c.pcm.length).toBe(288000);
    expect(d.pcm.length).toBe(72000);
    expect(a.pcm.some((v) => Math.abs(v) > 1000)).toBe(true);
  });
  it("honours latency, abort and failure", async () => {
    const e = new FakeEngine({ latencyMs: 200 });
    const ac = new AbortController();
    const p = e.synthesize("hello", { voice: "af_heart", speed: 1, signal: ac.signal });
    setTimeout(() => ac.abort(), 20);
    await expect(p).rejects.toThrow();
    expect(e.aborted).toBe(1);
    expect(e.active).toBe(0);
    e.latencyMs = 0;
    e.failOn = (t) => t.includes("boom");
    await expect(e.synthesize("boom", { voice: "af_heart", speed: 1 })).rejects.toThrow("fake engine failure");
    expect((await e.synthesize("fine", { voice: "af_heart", speed: 1 })).pcm.length).toBeGreaterThan(0);
  });
  it("refuses to synthesize until ready", async () => {
    const e = new FakeEngine({ state: "downloading" });
    await expect(e.synthesize("x", { voice: "af_heart", speed: 1 })).rejects.toBeInstanceOf(EngineNotReadyError);
    await e.start();
    expect(e.status().state).toBe("ready");
  });
});

describe("voices", () => {
  it("lists all 28 kokoro voices mapped to protocol shape", () => {
    expect(KOKORO_VOICES).toHaveLength(28);
    expect(new Set(KOKORO_VOICES.map((v) => v.id)).size).toBe(28);
    const heart = KOKORO_VOICES.find((v) => v.id === "af_heart")!;
    expect(heart).toMatchObject({ name: "Heart", lang: "en-US", gender: "female", quality: "A" });
    expect(KOKORO_VOICES.find((v) => v.id === "bm_george")).toMatchObject({
      lang: "en-GB",
      gender: "male",
      quality: "C",
    });
    expect(KOKORO_VOICES.find((v) => v.id === "am_adam")!.quality).toBe("D");
    expect(KOKORO_VOICES.every((v) => "ABCD".includes(v.quality))).toBe(true);
  });
});
