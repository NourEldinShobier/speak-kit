import { describe, expect, it } from "vite-plus/test";
import { KokoroEngine } from "../src";

// Opt-in: SPEAKKIT_REAL=1 (downloads ~90 MB on first run into SPEAKKIT_MODELS_DIR).
const modelsDir = process.env.SPEAKKIT_MODELS_DIR ?? "D:/workspaces/speak-it/code/.cache/models";

describe.skipIf(!process.env.SPEAKKIT_REAL)("KokoroEngine (real model)", () => {
  it("loads, speaks, splits long sentences and aborts", async () => {
    const e = new KokoroEngine({ modelsDir });
    expect(e.status().state).toBe("unloaded"); // cached on disk, nothing in RAM
    expect(new KokoroEngine({ modelsDir: modelsDir + "-absent" }).status().state).toBe("missing");
    await e.start();
    expect(e.status().state).toBe("ready");

    const r = await e.synthesize("This is a short test sentence for the speech engine.", {
      voice: "af_heart",
      speed: 1,
    });
    expect(r.sampleRate).toBe(24000);
    expect(r.pcm.length).toBeGreaterThan(24000);
    expect(r.pcm.some((v) => Math.abs(v) > 1000)).toBe(true);

    const long = Array.from({ length: 12 }, (_, i) => `clause number ${i} goes on a little while`).join(", ") + ".";
    expect(long.length).toBeGreaterThan(300);
    const l = await e.synthesize(long, { voice: "bf_emma", speed: 1.5 });
    expect(l.pcm.length).toBeGreaterThan(r.pcm.length * 3);

    const ac = new AbortController();
    const p = e.synthesize(long, { voice: "af_heart", speed: 1, signal: ac.signal });
    setTimeout(() => ac.abort(new Error("stop")), 50);
    await expect(p).rejects.toThrow("stop");

    // Unload frees the model host; the next call reloads transparently.
    expect(await e.unload()).toBe(true);
    expect(e.status().state).toBe("unloaded");
    const back = await e.synthesize("Back again.", { voice: "af_heart", speed: 1 });
    expect(back.pcm.length).toBeGreaterThan(12000);
    await e.close();
  }, 600_000);
});
