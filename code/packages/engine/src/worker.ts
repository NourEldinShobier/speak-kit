// Runs in a worker_thread. Plain Node-runnable TS (type stripping): no enums, no extensionless relative value imports.
import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import * as v from "valibot";
import type { FromWorker, ToWorker, WorkerInit } from "./worker-protocol";

/** Parsed in the worker: a missing or malformed start-up config fails with a readable message, not a crash. */
const workerInitSchema: v.GenericSchema<unknown, WorkerInit> = v.object({
  modelsDir: v.string(),
  modelId: v.string(),
  dtype: v.picklist(["fp32", "fp16", "q8", "uint8", "q4", "q4f16"]),
  device: v.picklist(["cpu", "dml"]),
  threads: v.number(),
  warmup: v.boolean(),
  warmupVoice: v.string(),
});

// Two hosts: a worker_thread (parentPort) or a child process (IPC, init in env). Same protocol either way.
const inProcess = parentPort === null;
const init = v.parse(workerInitSchema, inProcess ? JSON.parse(process.env.SPEAKKIT_WORKER_INIT ?? "null") : workerData);
const send = (m: FromWorker, transfer: ArrayBuffer[] = []) => (inProcess ? void process.send!(m) : parentPort!.postMessage(m, transfer));

import type { KokoroTTS } from "kokoro-js";

type GenerateOptions = NonNullable<Parameters<KokoroTTS["generate"]>[1]>;
let tts: KokoroTTS | undefined;
const cancelled = new Set<number>();

async function load(): Promise<void> {
  send({ type: "status", state: "loading" });
  const { KokoroTTS } = await import("kokoro-js");
  // transformers.js is a dependency of kokoro-js only; load the very same ESM instance kokoro-js uses.
  const cjs = createRequire(import.meta.resolve("kokoro-js")).resolve("@huggingface/transformers");
  const tf = await import(pathToFileURL(cjs.replace(/\.cjs$/, ".mjs")).href);

  const downloading = new Set<string>();
  let lastSent = -1;
  const onProgress = (e: { status: string; file?: string; loaded?: number; total?: number }) => {
    const f = e.file ?? "";
    if (e.status === "download") {
      downloading.add(f);
      send({
        type: "status",
        state: "downloading",
        progress: lastSent < 0 ? 0 : lastSent,
        detail: f,
      });
    } else if (e.status === "progress" && e.total && f.endsWith(".onnx")) {
      // The model file is >99% of the bytes; the small config/tokenizer files are not tracked.
      const p = Math.min(1, (e.loaded ?? 0) / e.total);
      if (p - lastSent >= 0.005 || p >= 1) {
        lastSent = p;
        send({ type: "status", state: "downloading", progress: p, detail: f });
      }
    } else if (e.status === "done" && downloading.delete(f) && f.endsWith(".onnx")) {
      send({ type: "status", state: "loading" });
    }
  };

  const opts = { progress_callback: onProgress, cache_dir: init.modelsDir };
  const [model, tokenizer] = await Promise.all([
    tf.StyleTextToSpeech2Model.from_pretrained(init.modelId, {
      ...opts,
      dtype: init.dtype,
      device: init.device,
      session_options: {
        intraOpNumThreads: init.threads,
        interOpNumThreads: 1,
        // Graph optimization costs ~0.35 s of every load and gains nothing measurable on this pre-quantized model (docs/perf.md).
        ...(init.device === "dml" ? { enableMemPattern: false, executionMode: "sequential" } : { graphOptimizationLevel: "disabled" }),
      },
    }),
    tf.AutoTokenizer.from_pretrained(init.modelId, opts),
  ]);
  tts = new KokoroTTS(model, tokenizer);
  if (init.warmup) await tts.generate("Hello there.", { voice: init.warmupVoice, speed: 1 } as GenerateOptions);
  // The model file is read into a JS buffer first; collect it so idle RSS drops.
  setFlagsFromString("--expose-gc");
  (runInNewContext("gc") as () => void)();
  send({ type: "status", state: "ready" });
}

function toInt16(f: Float32Array): Int16Array {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]!));
    o[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return o;
}

async function run(m: Extract<ToWorker, { type: "synth" }>): Promise<void> {
  if (cancelled.delete(m.id)) return send({ type: "result", id: m.id, cancelled: true });
  try {
    const a = await tts!.generate(m.text, { voice: m.voice, speed: m.speed } as GenerateOptions); // the server validated the voice id
    const pcm = toInt16(a.audio);
    send({ type: "result", id: m.id, pcm, sampleRate: a.sampling_rate }, [pcm.buffer as ArrayBuffer]);
  } catch (e) {
    send({ type: "error", id: m.id, message: e instanceof Error ? e.message : String(e) });
  }
}

// Jobs run strictly one at a time, in arrival order, after the model is loaded.
let chain: Promise<void> = load().catch((e) => {
  send({ type: "fatal", message: e instanceof Error ? e.message : String(e) });
  tts = undefined;
});
const onMessage = (m: ToWorker) => {
  if (m.type === "cancel") cancelled.add(m.id);
  else chain = chain.then(() => (tts ? run(m) : send({ type: "error", id: m.id, message: "engine failed to load" })));
};
if (inProcess) {
  process.on("message", onMessage);
  process.on("disconnect", () => process.exit(0)); // the server went away
} else parentPort!.on("message", onMessage);
