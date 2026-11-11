import { describe, expect, it } from "vite-plus/test";
import type { Clip } from "@speakkit/dictation";
import { createTranscriber, modelViews } from "./stt";
import { FakeStt } from "./stt-fake";

const clip = (samples: number[], rate = 16_000): Clip => ({ pcm: Float32Array.from(samples), sampleRate: rate, peak: Math.max(...samples.map(Math.abs)) });

async function ready(model = "large-v3-turbo-q5_0") {
  const stt = new FakeStt();
  await stt.load(model as never);
  const failed: Clip[] = [];
  const t = createTranscriber({ stt, model: () => model as never, onFailedClip: (c) => failed.push(c) });
  return { stt, t, failed };
}

describe("transcriber", () => {
  it("gives the audio to the engine as 16-bit samples and returns its text", async () => {
    const { stt, t } = await ready();
    stt.say({ text: " hello world " });
    const got = await t.transcribe({ clip: clip([0, 0.5, -0.5, 1, -1, 2]), language: "en" });
    expect(got).toEqual({ ok: true, text: "hello world", model: "large-v3-turbo-q5_0", language: "en" });
    expect(stt.calls()).toEqual([{ language: "en", samples: 6, peak: 32767 }]);
  });

  it("leaves the language to the engine when it is automatic", async () => {
    const { t } = await ready();
    expect(await t.transcribe({ clip: clip([0.1]), language: "auto" })).not.toHaveProperty("language");
  });

  it("falls back to detection for a language the model lacks", async () => {
    const { stt, t } = await ready("parakeet-tdt-0.6b-v3-q4_0");
    await t.transcribe({ clip: clip([0.1]), language: "ar" });
    expect(stt.calls()[0]!.language).toBe("auto");
  });

  it("returns empty text when the voice gate found no speech", async () => {
    const { stt, t } = await ready();
    stt.say({ text: "" });
    expect(await t.transcribe({ clip: clip([0.1]), language: "en" })).toMatchObject({ ok: true, text: "" });
  });

  it("says the model is loading while it downloads or loads", async () => {
    const stt = new FakeStt();
    await stt.setInstalled("large-v3-turbo-q5_0", false);
    const t = createTranscriber({ stt, model: () => "large-v3-turbo-q5_0", onFailedClip: () => undefined });
    const loading = stt.load("large-v3-turbo-q5_0");
    expect(await t.transcribe({ clip: clip([0.1]), language: "en" })).toEqual({ ok: false, code: "model-loading" });
    stt.finishDownload();
    await loading;
  });

  it("starts loading a model that is on disk but not loaded, and says it is loading", async () => {
    const stt = new FakeStt();
    const t = createTranscriber({ stt, model: () => "large-v3-turbo-q5_0", onFailedClip: () => undefined });
    expect(await t.transcribe({ clip: clip([0.1]), language: "en" })).toEqual({ ok: false, code: "model-loading" });
    await new Promise((r) => setTimeout(r, 10));
    expect(stt.status().state).toBe("ready");
  });

  it("says the model is missing when it is not on disk", async () => {
    const stt = new FakeStt();
    await stt.setInstalled("large-v3-turbo-q5_0", false);
    const t = createTranscriber({ stt, model: () => "large-v3-turbo-q5_0", onFailedClip: () => undefined });
    expect(await t.transcribe({ clip: clip([0.1]), language: "en" })).toEqual({ ok: false, code: "model-missing" });
  });

  it("reports a failing engine and keeps the audio for one retry", async () => {
    const { stt, t, failed } = await ready();
    stt.say({ fail: true });
    const c = clip([0.2, 0.3]);
    expect(await t.transcribe({ clip: c, language: "en" })).toEqual({ ok: false, code: "failed" });
    expect(failed).toEqual([c]);
  });
});

describe("model views", () => {
  const installed = { "large-v3-turbo-q5_0": true, "parakeet-tdt-0.6b-v3-q4_0": false };
  it("attaches progress to the model being downloaded only", () => {
    const views = modelViews("large-v3-turbo-q5_0", installed, { id: "parakeet-tdt-0.6b-v3-q4_0", kind: "downloading", fraction: 0.38, etaSeconds: 120 });
    expect(views[0]).not.toHaveProperty("progress");
    expect(views[1]!.progress).toEqual({ kind: "downloading", fraction: 0.38, etaSeconds: 120 });
  });
  it("shows a model being loaded as preparing, without a fraction", () => {
    expect(modelViews("large-v3-turbo-q5_0", installed, { id: "large-v3-turbo-q5_0", kind: "preparing", fraction: 1 })[0]!.progress).toEqual({ kind: "preparing" });
  });
  it("names the languages each model understands and its size", () => {
    const [turbo, parakeet] = modelViews("large-v3-turbo-q5_0", installed, null);
    expect(turbo).toMatchObject({ tag: "Accurate", bytes: 574_041_195, languages: ["auto", "en", "de", "ar"] });
    expect(parakeet).toMatchObject({ tag: "Fast", languages: ["auto", "en", "de"] });
  });
});
