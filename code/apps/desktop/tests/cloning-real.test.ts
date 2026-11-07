import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ClonedVoice } from "@speakkit/protocol";
import { clip } from "../../../packages/engine/tests/clip-fixture";
import { launch, type Launched } from "./harness";

// Opt-in: SPEAKKIT_REAL_CHATTERBOX=1 with SPEAKKIT_CHATTERBOX_DATA_DIR pointing at a data directory whose engines/chatterbox holds an
// installed Chatterbox (the server test packages/server/tests/real-chatterbox.test.ts installs one) and SPEAKKIT_MODELS_DIR at the Kokoro
// model. The app runs the real Kokoro and the real Chatterbox on this machine's GPU; the clone flow uploads a generated 8 s clip.
// Measurements are written to <dir>/ui-metrics.json.
const dataDir = process.env.SPEAKKIT_CHATTERBOX_DATA_DIR ?? "";
const running: Launched[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});

describe.runIf(process.env.SPEAKKIT_REAL_CHATTERBOX)("voice cloning in the app with the real Chatterbox (real GPU)", () => {
  it("uploads a generated clip, waits for the model to load, plays the test sentence, saves the voice and previews it", async () => {
    const reference = path.join(tmpdir(), "speakkit-real-clone-8s.wav");
    writeFileSync(reference, clip(8));
    mkdirSync(dataDir, { recursive: true });
    const l = await launch({
      userData: dataDir,
      config: { setupDone: true, setupSkipped: false, preferredPort: 0 },
      env: { SPEAKKIT_TEST: "1", SPEAKKIT_ENGINE: "kokoro", SPEAKKIT_MODELS_DIR: process.env.SPEAKKIT_MODELS_DIR ?? "" },
    });
    running.push(l);
    const m: Record<string, number> = {};
    const since = (t: number) => Math.round(performance.now() - t);
    await l.page.getByRole("link", { name: "Voices" }).click();
    await l.page.getByRole("heading", { name: "Voices", level: 1 }).waitFor();
    await l.page.getByRole("button", { name: "Clone a voice" }).waitFor();
    await expect.poll(() => l.page.getByRole("button", { name: "Clone a voice" }).isEnabled(), { timeout: 30_000 }).toBe(true);
    await l.app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog;
    }, reference);

    await l.page.getByRole("button", { name: "Clone a voice" }).click();
    await l.page.getByRole("radio", { name: /^Upload a clip/ }).click();
    await l.page.getByText(/the right to clone it/).click();
    const t0 = performance.now();
    await l.page.getByRole("button", { name: "Continue" }).click();
    await l.page.getByText(/^Loading Chatterbox onto the GPU/).waitFor({ timeout: 60_000 });
    m.checksMs = since(t0);
    await l.page.getByLabel("Name").waitFor({ timeout: 300_000 });
    m.checksAndLoadMs = since(t0);

    await l.page.getByLabel("Name").fill("Generated tone");
    const t1 = performance.now();
    await l.page.getByRole("button", { name: "Play test" }).click();
    await l.page.getByRole("button", { name: "Stop" }).waitFor({ timeout: 120_000 });
    await l.page.getByRole("button", { name: "Play test" }).waitFor({ timeout: 120_000 });
    m.testSentenceMs = since(t1);
    await l.page.getByRole("button", { name: "Save voice" }).click();
    await l.page.getByText("Generated tone is saved").waitFor();
    await l.page.getByRole("button", { name: "Done" }).click();
    await l.page.getByRole("region", { name: "Your voices" }).getByText("Generated tone", { exact: true }).waitFor();

    const token = readFileSync(path.join(dataDir, "token"), "utf8").trim();
    const list = await fetch(`http://127.0.0.1:${l.port}/v1/voices/cloned`, { headers: { Authorization: `Bearer ${token}` } });
    const [voice] = ((await list.json()) as { voices: ClonedVoice[] }).voices;
    expect(voice).toMatchObject({ name: "Generated tone", exaggeration: 0.5 });
    m.voiceDurationMs = voice!.durationMs;

    const t2 = performance.now();
    await l.page.getByRole("button", { name: "Preview Generated tone" }).click();
    await l.page.getByRole("button", { name: "Stop Generated tone" }).waitFor({ timeout: 60_000 });
    await l.page.getByRole("button", { name: "Preview Generated tone" }).waitFor({ timeout: 60_000 });
    m.previewMs = since(t2);

    await l.page.getByRole("button", { name: "Delete Generated tone" }).click();
    await l.page.getByRole("dialog", { name: "Delete Generated tone?" }).getByRole("button", { name: "Delete" }).click();
    await expect
      .poll(async () => ((await (await fetch(`http://127.0.0.1:${l.port}/v1/voices/cloned`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { voices: unknown[] }).voices)
      .toEqual([]);
    writeFileSync(path.join(dataDir, "ui-metrics.json"), JSON.stringify(m, null, 2));
  }, 900_000);
});
