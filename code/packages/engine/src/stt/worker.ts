// Runs as a child process (see channel.ts). Plain Node-runnable TS (type stripping): no enums, no extensionless relative value imports.
import * as v from "valibot";
import type { ParakeetContext, WhisperContext, WhisperVadContext } from "@fugood/whisper.node";
import type { SttFromWorker, SttToWorker, SttWorkerInit } from "./worker-protocol";

const initSchema: v.GenericSchema<unknown, SttWorkerInit> = v.object({
  engine: v.picklist(["whisper", "parakeet"]),
  modelPath: v.string(),
  vadPath: v.string(),
  gpu: v.boolean(),
  threads: v.number(),
});
const init = v.parse(initSchema, JSON.parse(process.env.SPEAKKIT_WORKER_INIT ?? "null"));
const send = (m: SttFromWorker) => void process.send!(m);

const SAMPLE_RATE = 16000;
// Whisper invents text on silence and a loudness gate does not stop it; Silero decides whether there is speech at all.
const VAD = { threshold: 0.4, minSpeechDurationMs: 160 };
// Speech edges from the VAD are tight; Whisper drops the first and last word without a little room around them.
const MARGIN = Math.round(SAMPLE_RATE * 0.2);
const CS_TO_SAMPLES = SAMPLE_RATE / 100;

let model: WhisperContext | ParakeetContext | undefined;
let vad: WhisperVadContext;

const ab = (a: Int16Array) => a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer;

async function recognize(pcm: Int16Array, language: string): Promise<string> {
  const opts = { maxThreads: init.threads };
  const { promise } = init.engine === "parakeet" ? (model as ParakeetContext).transcribeData(ab(pcm), opts) : (model as WhisperContext).transcribeData(ab(pcm), { ...opts, language });
  return (await promise).result.trim();
}

async function load(): Promise<void> {
  send({ type: "status", state: "loading" });
  const w = await import("@fugood/whisper.node");
  const variant = process.platform === "darwin" ? "default" : "vulkan"; // macOS has Metal in the default addon; Windows and Linux use the Vulkan addon, which falls back to the default one when missing
  await w.loadWhisperModule(variant);
  // Without a listener whisper.cpp prints a page of model details to stderr; keep only errors.
  w.addNativeLogListener((level, text) => void (level === "error" && process.stderr.write(text)));
  await w.toggleNativeLog(true);
  vad = await w.initWhisperVad({ filePath: init.vadPath });
  const open = (useGpu: boolean) => (init.engine === "parakeet" ? w.initParakeet({ filePath: init.modelPath, useGpu }, variant) : w.initWhisper({ filePath: init.modelPath, useGpu }, variant));
  let backend: "gpu" | "cpu" = init.gpu ? "gpu" : "cpu";
  try {
    model = await open(init.gpu);
  } catch (e) {
    if (!init.gpu) throw e;
    backend = "cpu"; // no usable GPU (driver, memory): run the same model on the CPU
    model = await open(false);
  }
  // The first inference after a load compiles GPU kernels (seconds, measured); pay it here, not on the user's first dictation.
  await recognize(new Int16Array(SAMPLE_RATE), "en").catch(() => "");
  send({ type: "status", state: "ready", backend });
}

async function run(m: SttToWorker): Promise<void> {
  try {
    const segs = await vad.detectSpeechData(ab(m.pcm), VAD);
    if (!segs.length) return send({ type: "result", id: m.id, text: "", speech: false });
    const from = Math.max(0, segs[0]!.t0 * CS_TO_SAMPLES - MARGIN);
    const to = Math.min(m.pcm.length, segs[segs.length - 1]!.t1 * CS_TO_SAMPLES + MARGIN);
    const text = await recognize(m.pcm.subarray(Math.floor(from), Math.ceil(to)), m.language);
    send({ type: "result", id: m.id, text, speech: true });
  } catch (e) {
    send({ type: "error", id: m.id, message: e instanceof Error ? e.message : String(e) });
  }
}

// Jobs run one at a time, in arrival order, after the model is loaded.
let chain: Promise<void> = load().catch((e) => {
  send({ type: "fatal", message: e instanceof Error ? e.message : String(e) });
});
process.on("message", (m: SttToWorker) => {
  chain = chain.then(() => (model ? run(m) : send({ type: "error", id: m.id, message: "speech model failed to load" })));
});
process.on("disconnect", () => process.exit(0)); // the app went away
