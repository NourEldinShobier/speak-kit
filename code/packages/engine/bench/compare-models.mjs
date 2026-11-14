// Compares speech models on your own recordings (build first: pnpm --filter @speakkit/engine build).
//   node bench/compare-models.mjs <recordings-dir> [models-dir]
// <recordings-dir> holds pairs name.wav + name.txt (the words that were said). Every model of the catalog that is on disk in <models-dir>/stt runs on every
// recording; the report names each recording and each model file, with recall, word error rate and latency. The audio comes from the files, not a microphone.
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { STT_MODELS, WhisperStt, formatReport, modelPresent, parseWav, recall, wordErrorRate } from "../dist/index.js";

const [dir, modelsDir = join(homedir(), ".speakkit", "models")] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node bench/compare-models.mjs <recordings-dir> [models-dir]");
  process.exit(2);
}

const names = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".wav")).sort();
const pairs = [];
for (const wav of names) {
  const text = await readFile(join(dir, wav.replace(/\.wav$/i, ".txt")), "utf8").catch(() => null);
  if (text === null) console.warn(`skipping ${wav}: no ${basename(wav, ".wav")}.txt next to it`);
  else pairs.push({ wav, text });
}
if (pairs.length === 0) {
  console.error("no recordings with a transcript found");
  process.exit(2);
}

const to16 = (f) => Int16Array.from(f, (x) => Math.round(Math.max(-1, Math.min(1, x)) * 32767));
const rows = [];
for (const model of STT_MODELS) {
  if (!(await modelPresent(join(modelsDir, "stt", model.file), model))) {
    console.warn(`skipping ${model.file}: not in ${join(modelsDir, "stt")}`);
    continue;
  }
  const stt = new WhisperStt({ modelsDir });
  await stt.load(model.id);
  for (const { wav, text } of pairs) {
    const audio = parseWav(await readFile(join(dir, wav)));
    if (audio.sampleRate !== 16000) {
      console.warn(`skipping ${wav}: ${audio.sampleRate} Hz, need 16000`);
      continue;
    }
    const t0 = performance.now();
    const heard = await stt.transcribe(to16(audio.samples), model.languages.includes("en") ? "en" : "auto");
    rows.push({ recording: wav, modelFile: model.file, recall: recall(text, heard.text), wer: wordErrorRate(text, heard.text), latencyMs: performance.now() - t0 });
  }
  await stt.unload();
}
console.log(formatReport(rows));
