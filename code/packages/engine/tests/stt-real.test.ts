import { readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { STT_MODELS, WhisperStt, type SttLanguage, type SttModelId } from "../src";

// Opt-in: SPEAKKIT_REAL_STT=1 with
//   SPEAKKIT_MODELS_DIR  a folder whose stt/ subfolder holds (or receives) the model files,
//   SPEAKKIT_STT_AUDIO   a folder of 16 kHz mono 16-bit WAVs with a matching .txt reference each,
//   SPEAKKIT_STT_MODEL   large-v3-turbo-q5_0 (default) or parakeet-tdt-0.6b-v3-q4_0,
//   SPEAKKIT_STT_GPU=0   to measure the CPU fallback.
const env = process.env;
const modelId = (env.SPEAKKIT_STT_MODEL ?? "large-v3-turbo-q5_0") as SttModelId;
const gpu = env.SPEAKKIT_STT_GPU !== "0";
const audio = env.SPEAKKIT_STT_AUDIO ?? "";

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
function wer(reference: string, hypothesis: string): number {
  const a = norm(reference);
  const b = norm(hypothesis);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]! / a.length;
}
const clip = async (id: string) => {
  const b = await readFile(join(audio, `${id}.wav`));
  const pcm = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.byteLength));
  return { pcm, seconds: pcm.length / 16000, reference: await readFile(join(audio, `${id}.txt`), "utf8") };
};
/** Share of all CPU time spent busy (by every process) since `from`; the speech timings only mean something on a quiet machine. */
const busy = (from: ReturnType<typeof cpus>) => {
  const sum = (c: ReturnType<typeof cpus>, k: "idle" | "total") => c.reduce((n, x) => n + (k === "idle" ? x.times.idle : Object.values(x.times).reduce((a, b) => a + b, 0)), 0);
  const now = cpus();
  return Math.round((1 - (sum(now, "idle") - sum(from, "idle")) / (sum(now, "total") - sum(from, "total"))) * 100);
};
const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)]!;

describe.runIf(env.SPEAKKIT_REAL_STT)("WhisperStt (real model)", () => {
  it("loads cold and warm, transcribes English, German and Arabic, and gates silence", async () => {
    const model = STT_MODELS.find((m) => m.id === modelId)!;
    const e = new WhisperStt({ modelsDir: env.SPEAKKIT_MODELS_DIR!, gpu });
    const report: Record<string, unknown> = { model: modelId, gpuRequested: gpu };

    const cpuBefore = cpus();
    let t = performance.now();
    await e.load(modelId);
    report.firstLoadMs = Math.round(performance.now() - t);
    report.backend = e.backend;
    await e.unload();
    t = performance.now();
    await e.load(modelId);
    report.warmLoadMs = Math.round(performance.now() - t);

    const latency: Record<string, number> = {};
    const werByClip: Record<string, number> = {};
    for (const [id, language, max] of [
      ["en-sapi-5s", "en", 0.2],
      ["en-sapi-15s", "en", 0.2],
      ["en-real-0", "en", 0.3],
      ["de-0", "de", 0.3],
      ["ar-0", "ar", 0.3],
    ] as [string, SttLanguage, number][]) {
      if (!model.languages.includes(language)) continue;
      const c = await clip(id);
      const times: number[] = [];
      let text = "";
      for (let i = 0; i < 5; i++) {
        t = performance.now();
        text = (await e.transcribe(c.pcm, language)).text;
        times.push(performance.now() - t);
      }
      latency[`${id} (${c.seconds.toFixed(1)} s)`] = Math.round(median(times.slice(1)));
      werByClip[id] = Number(wer(c.reference, text).toFixed(3));
      expect(werByClip[id], `${id}: ${text}`).toBeLessThan(max);
    }
    report.medianMs = latency;
    report.wer = werByClip;
    report.machineCpuBusyPercent = busy(cpuBefore);

    const noise = Int16Array.from({ length: 48000 }, () => Math.round((Math.random() - 0.5) * 60));
    expect(await e.transcribe(new Int16Array(48000), "en")).toEqual({ text: "", speech: false });
    expect(await e.transcribe(noise, "en")).toEqual({ text: "", speech: false });

    if (env.SPEAKKIT_STT_REPORT) await writeFile(env.SPEAKKIT_STT_REPORT, JSON.stringify(report, null, 1));
    await e.unload();
  }, 900_000);
});
