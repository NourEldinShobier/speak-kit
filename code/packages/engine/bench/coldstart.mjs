// Phase timing of a cold model load (run from packages/engine: node bench/coldstart.mjs).
// Env: SPEAKKIT_GRAPH=disabled|basic|extended|all, SPEAKKIT_THREADS, SPEAKKIT_OPT_CACHE=<file>, SPEAKKIT_SKIP_WARMUP=1.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const t0 = performance.now();
const lap = (label, from = t0) => console.log(label.padEnd(28), Math.round(performance.now() - from), "ms");
const { KokoroTTS } = await import("kokoro-js");
lap("import kokoro-js");
const cjs = createRequire(import.meta.resolve("kokoro-js")).resolve("@huggingface/transformers");
const tf = await import(pathToFileURL(cjs.replace(/\.cjs$/, ".mjs")).href);
lap("import transformers");
const env = process.env;
const opts = { cache_dir: env.SPEAKKIT_MODELS_DIR ?? "../../.cache/models" };
const id = "onnx-community/Kokoro-82M-v1.0-ONNX";
const session_options = {
  intraOpNumThreads: Number(env.SPEAKKIT_THREADS ?? 6),
  interOpNumThreads: 1,
  ...(env.SPEAKKIT_GRAPH ? { graphOptimizationLevel: env.SPEAKKIT_GRAPH } : {}),
  ...JSON.parse(env.SPEAKKIT_SESSION ?? "{}"),
  ...(env.SPEAKKIT_OPT_CACHE ? { optimizedModelFilePath: env.SPEAKKIT_OPT_CACHE } : {}),
};
let t = performance.now();
const tokP = tf.AutoTokenizer.from_pretrained(id, opts).then((x) => (lap("tokenizer", t), x));
const modP = tf.StyleTextToSpeech2Model.from_pretrained(id, { ...opts, dtype: "uint8", device: "cpu", session_options }).then((x) => (lap("model (read+session)", t), x));
let tts;
if (env.SPEAKKIT_OVERLAP) {
  const tokenizer = await tokP;
  const fn = (i) => modP.then((m) => m(i));
  tts = new KokoroTTS(fn, tokenizer);
  const w = tts.generate("Hello there.", { voice: "af_heart", speed: 1 }).then(() => lap("warm-up done (overlapped)", t0));
  await Promise.all([modP, w]);
  lap("load+warm total", t0);
  tts = new KokoroTTS(await modP, tokenizer);
} else {
  const [model, tokenizer] = await Promise.all([modP, tokP]);
  lap("load total", t);
  tts = new KokoroTTS(model, tokenizer);
  t = performance.now();
  await tts.generate("Hello there.", { voice: "af_heart", speed: 1 });
  lap("warm-up generate", t);
  lap("load+warm total", t0);
}
t = performance.now();
await tts.generate("The quick brown fox jumps over the lazy dog near the old river.", { voice: "af_heart", speed: 1 });
lap("first real sentence", t);
t = performance.now();
await tts.generate("The quick brown fox jumps over the lazy dog near the old river.", { voice: "af_heart", speed: 1 });
lap("second sentence", t);
lap("process total", t0);

if (env.SPEAKKIT_RUNS) {
  const ms = [];
  for (let i = 0; i < Number(env.SPEAKKIT_RUNS); i++) {
    const s = performance.now();
    await tts.generate("The quick brown fox jumps over the lazy dog near the old river.", { voice: "af_heart", speed: 1 });
    ms.push(Math.round(performance.now() - s));
  }
  console.log("median of", ms.length, ms.sort((a, b) => a - b)[ms.length >> 1], "ms");
}
process.exit(0);
