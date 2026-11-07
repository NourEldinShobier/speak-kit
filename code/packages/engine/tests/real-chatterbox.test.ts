import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { ChatterboxEngine, encodeWav } from "../src";

// Opt-in: SPEAKKIT_REAL_CHATTERBOX=1. Needs an NVIDIA GPU (4 GB+), uv or Python 3.10 to 3.12, and about 8 GB of downloads
// (CUDA torch and chatterbox-tts in a virtualenv, then 3.2 GB of weights on first load). Not run in CI or on machines without them.
// SPEAKKIT_CHATTERBOX_DIR points at an existing install to reuse. Measurements are written to <dir>/metrics.json.
const dir = process.env.SPEAKKIT_CHATTERBOX_DIR ?? "../../.cache/chatterbox";
const SENTENCE = "This is a short test sentence for the speech engine.";
const LONG = "The quick brown fox jumps over the lazy dog near the quiet river bank. Then it rests under an old oak tree while the afternoon sun slowly sets.";

const vramMb = () => Number(execFileSync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { encoding: "utf8" }).trim().split("\n")[0]);
const ms = (t: number) => Math.round(performance.now() - t);
const peak = (pcm: Int16Array) => pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe.skipIf(!process.env.SPEAKKIT_REAL_CHATTERBOX)("ChatterboxEngine (real model)", () => {
  it("installs, loads, speaks, clones, aborts and frees VRAM on unload", async () => {
    const e = await ChatterboxEngine.create({ dir, voicesDir: join(dir, "voices") });
    if (e.status().state === "unavailable") throw new Error(`cannot run here: ${e.status().detail}`);
    const m: Record<string, number> = {};
    if (e.status().state === "missing") {
      const t = performance.now();
      await e.install();
      m.installMs = ms(t);
    }

    m.vramBaseMb = vramMb();
    let t = performance.now();
    await e.start();
    m.loadMs = ms(t);
    expect(e.status().state).toBe("ready");
    m.vramLoadedMb = vramMb();
    expect(m.vramLoadedMb - m.vramBaseMb).toBeGreaterThan(1500);

    t = performance.now();
    const r = await e.synthesize(SENTENCE, { voice: "chatterbox", speed: 1 });
    m.firstAudioMs = ms(t);
    expect(r.sampleRate).toBe(24000);
    expect(r.pcm.length).toBeGreaterThan(24000);
    expect(peak(r.pcm)).toBeGreaterThan(1000);
    t = performance.now();
    const warm = await e.synthesize(LONG, { voice: "chatterbox", speed: 1 });
    m.warmMs = ms(t);
    m.warmAudioMs = Math.round((warm.pcm.length / warm.sampleRate) * 1000);
    m.rtf = Number((m.warmMs / m.warmAudioMs).toFixed(2));

    // Cloning: the engine's own long output is the reference clip (>= 5 s).
    expect(m.warmAudioMs).toBeGreaterThan(5000);
    const voice = await e.clones.create({ name: "self", wav: encodeWav(warm.pcm, warm.sampleRate), durationMs: m.warmAudioMs, checks: [] });
    t = performance.now();
    const cloned = await e.synthesize(SENTENCE, { voice: voice.id, speed: 1 });
    m.cloneMs = ms(t);
    expect(peak(cloned.pcm)).toBeGreaterThan(1000);
    expect(cloned.pcm).not.toEqual(r.pcm);

    // Abort: the call rejects at once and the sidecar stops sampling, so the next request is not queued behind it.
    const ac = new AbortController();
    const aborted = e.synthesize(LONG, { voice: "chatterbox", speed: 1, signal: ac.signal });
    setTimeout(() => ac.abort(new Error("stop")), 300);
    await expect(aborted).rejects.toThrow("stop");
    t = performance.now();
    await e.synthesize("Hello.", { voice: "chatterbox", speed: 1 });
    m.afterAbortMs = ms(t);
    expect(m.afterAbortMs).toBeLessThan(m.warmMs);

    expect(await e.unload()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    m.vramUnloadedMb = vramMb();
    expect(m.vramUnloadedMb - m.vramBaseMb).toBeLessThan(300);
    await e.close();
    writeFileSync(join(dir, "metrics.json"), JSON.stringify(m, null, 2)); // the runner hides console output of passing tests
  }, 3_600_000);
});
