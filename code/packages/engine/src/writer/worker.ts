// Runs as a child process (see channel.ts). Plain Node-runnable TS (type stripping): no enums, no extensionless relative value imports.
import * as v from "valibot";
import type { Llama, LlamaChatSession, LlamaModel } from "node-llama-cpp";
import { hostPort } from "../host-port.ts"; // the extension is what node needs to run this file as it is, without a build
import { tidy } from "./tidy.ts";
import type { WriterFromWorker, WriterToWorker, WriterWorkerInit } from "./worker-protocol";

const initSchema: v.GenericSchema<unknown, WriterWorkerInit> = v.object({ modelPath: v.string(), gpu: v.boolean(), threads: v.number() });
const init = v.parse(initSchema, JSON.parse(process.env.SPEAKKIT_WORKER_INIT ?? "null"));
const port = hostPort();
const send = (m: WriterFromWorker) => port.send(m);

/** Room for the instructions and one dictation; a longer one is cut by the model, not by us. */
const CONTEXT_TOKENS = 4096;

let session: LlamaChatSession | undefined;
const stops = new Map<number, AbortController>();

/** The graphics card first when asked; when it cannot hold the model (driver, memory) the same model runs on the CPU. */
async function open(lib: typeof import("node-llama-cpp")): Promise<{ llama: Llama; model: LlamaModel; fallback?: string }> {
  const attempt = async (useGpu: boolean) => {
    const llama = await lib.getLlama({ gpu: useGpu ? "auto" : false, build: "never", progressLogs: false, logLevel: lib.LlamaLogLevel.error });
    return { llama, model: await llama.loadModel({ modelPath: init.modelPath }) };
  };
  try {
    return await attempt(init.gpu);
  } catch (e) {
    if (!init.gpu) throw e;
    return { ...(await attempt(false)), fallback: e instanceof Error ? e.message : String(e) };
  }
}

async function load(): Promise<void> {
  send({ type: "status", state: "loading" });
  const t0 = Date.now();
  const lib = await import("node-llama-cpp");
  const { llama, model, fallback } = await open(lib);
  const context = await model.createContext({ contextSize: CONTEXT_TOKENS, threads: init.threads });
  // Thinking is off: Gemma 4 is a reasoning model and would spend seconds on thoughts nobody reads.
  session = new lib.LlamaChatSession({ contextSequence: context.getSequence(), chatWrapper: new lib.Gemma4ChatWrapper({ reasoning: false }) });
  // The first prompt after a load compiles kernels (seconds, measured); pay it here, not on the person's first dictation.
  await tidy(session, { system: "Repeat the text.", text: "hello", signal: new AbortController().signal }).catch(() => "");
  send({ type: "status", state: "ready", backend: llama.gpu ? "gpu" : "cpu", loadMs: Date.now() - t0, ...(fallback && { gpuFallback: fallback }) });
}

async function run(m: Extract<WriterToWorker, { type: "rewrite" }>): Promise<void> {
  const stop = stops.get(m.id);
  if (!stop || stop.signal.aborted) return; // aborted while it waited
  try {
    const text = await tidy(session!, { system: m.system, text: m.text, signal: stop.signal });
    send({ type: "result", id: m.id, text });
  } catch (e) {
    if (!stop.signal.aborted) send({ type: "error", id: m.id, message: e instanceof Error ? e.message : String(e) });
  } finally {
    stops.delete(m.id);
  }
}

// Jobs run one at a time, in arrival order, after the model is loaded.
let chain: Promise<void> = load().catch((e) => {
  send({ type: "fatal", message: e instanceof Error ? e.message : String(e) });
});
port.onMessage((m: WriterToWorker) => {
  if (m.type === "abort") return stops.get(m.id)?.abort(); // not queued behind the running job: it is the one to stop
  stops.set(m.id, new AbortController());
  chain = chain.then(() => (session ? run(m) : send({ type: "error", id: m.id, message: "the writer model failed to load" })));
});
process.on("disconnect", () => process.exit(0)); // the app went away
