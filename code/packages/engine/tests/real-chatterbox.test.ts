import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { ChatterboxEngine } from "../src";

// Opt-in: SPEAKKIT_REAL_CHATTERBOX=1. Needs an NVIDIA GPU (4 GB+), Python 3.10 to 3.12 and about 2.4 GB of downloads
// (virtualenv with chatterbox-tts and torch, then the model weights on first load). Not run in CI or on machines without them.
const dir = process.env.SPEAKKIT_CHATTERBOX_DIR ?? "D:/workspaces/speak-it/code/.cache/chatterbox";

describe.skipIf(!process.env.SPEAKKIT_REAL_CHATTERBOX)("ChatterboxEngine (real model)", () => {
  it("installs if needed, loads, speaks and unloads", async () => {
    const e = await ChatterboxEngine.create({ dir, voicesDir: join(dir, "voices") });
    if (e.status().state === "unavailable") throw new Error(`cannot run here: ${e.status().detail}`);
    if (e.status().state === "missing") await e.install();
    await e.start();
    expect(e.status().state).toBe("ready");
    const r = await e.synthesize("This is a short test sentence for the speech engine.", { voice: "chatterbox", speed: 1 });
    expect(r.sampleRate).toBe(24000);
    expect(r.pcm.length).toBeGreaterThan(24000);
    expect(r.pcm.some((v) => Math.abs(v) > 1000)).toBe(true);
    expect(await e.unload()).toBe(true);
    await e.close();
  }, 3_600_000);
});
