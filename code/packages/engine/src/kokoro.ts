import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_VOICE, SAMPLE_RATE, type Voice } from "@speakkit/protocol";
import { splitLong } from "./split";
import { KOKORO_VOICES } from "./voices";
import { processChannel, threadChannel, type Channel } from "./channel";
import { LifecycleEngine, type LifecycleOptions } from "./lifecycle";
import type { SynthOptions, Synthesized } from "./types";
import type { FromWorker, ToWorker, WorkerInit } from "./worker-protocol";

export interface KokoroOptions extends LifecycleOptions {
  /** Model cache root (transformers.js layout: <dir>/<modelId>/...). */
  modelsDir: string;
  modelId?: string;
  dtype?: WorkerInit["dtype"];
  device?: "cpu" | "dml";
  /** onnxruntime intra-op threads. */
  threads?: number;
  /** Run one dummy synthesis while loading so the first real request is fast. Default true. */
  warmup?: boolean;
  /** Override the worker entry (needed when this module is bundled). */
  workerUrl?: URL | string;
  /**
   * Where the model runs. "process" (default): a child process, so unloading returns all memory to the OS.
   * "thread": a worker_thread; terminating one leaks about 2.5 MB of native memory per load/unload cycle.
   */
  isolation?: "process" | "thread";
  /** Max chars per model call; longer sentences are split at clause boundaries. Default 300. */
  maxChunk?: number;
}

const GAP_SAMPLES = Math.round(SAMPLE_RATE * 0.08);

const MODEL_FILE: Record<WorkerInit["dtype"], string> = {
  fp32: "model.onnx",
  fp16: "model_fp16.onnx",
  q8: "model_quantized.onnx",
  uint8: "model_uint8.onnx",
  q4: "model_q4.onnx",
  q4f16: "model_q4f16.onnx",
};
const DEFAULT_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

/** transformers.js cache layout: <modelsDir>/<modelId>/onnx/<file>. */
function modelPresent(o: KokoroOptions): boolean {
  // oxlint-disable-next-line node/no-sync -- startup: decides the initial engine state once, in the constructor
  return existsSync(join(o.modelsDir, o.modelId ?? DEFAULT_MODEL, "onnx", MODEL_FILE[o.dtype ?? "uint8"]));
}

type Resolved = Required<Omit<KokoroOptions, "workerUrl" | "isolation" | keyof LifecycleOptions>> & {
  workerUrl?: URL | string;
  isolation: "process" | "thread";
};

/**
 * Kokoro-82M through onnxruntime-node, running in a worker thread so the caller's event loop never blocks.
 * Lazy: the worker (and the model in RAM) exists only between a load and an unload; see LifecycleEngine.
 * Unloading terminates the worker thread, which returns onnxruntime's memory to the OS.
 */
export class KokoroEngine extends LifecycleEngine {
  #o: Resolved;
  #worker: Channel<ToWorker, FromWorker> | undefined;
  #next = 1;
  #jobs = new Map<number, { resolve: (r: Synthesized | null) => void; reject: (e: Error) => void }>();

  constructor(o: KokoroOptions) {
    super(o, modelPresent(o) ? "unloaded" : "missing");
    this.#o = {
      modelId: DEFAULT_MODEL,
      dtype: "uint8",
      device: "cpu",
      threads: 6,
      warmup: true,
      maxChunk: 300,
      isolation: "process",
      ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)),
    } as Resolved;
  }

  voices(): Voice[] {
    return KOKORO_VOICES;
  }

  /** Process id of the model host when isolation is "process" and a model is loaded (for memory measurements). */
  get workerPid(): number | undefined {
    return this.#worker?.pid;
  }

  #channel(): Channel<ToWorker, FromWorker> {
    const o = this.#o;
    const url = o.workerUrl ?? new URL(import.meta.url.endsWith(".ts") ? "./worker.ts" : "./worker.js", import.meta.url);
    const workerData: WorkerInit = {
      modelsDir: o.modelsDir,
      modelId: o.modelId,
      dtype: o.dtype,
      device: o.device,
      threads: o.threads,
      warmup: o.warmup,
      warmupVoice: DEFAULT_VOICE,
    };
    return (o.isolation === "thread" ? threadChannel : processChannel)(url, workerData);
  }

  /** Hands a finished synthesis (result or error message) to the job waiting for it. */
  #settle(m: Extract<FromWorker, { type: "result" | "error" }>): void {
    const j = this.#jobs.get(m.id);
    if (!j) return;
    this.#jobs.delete(m.id);
    if (m.type === "error") j.reject(new Error(m.message));
    else j.resolve(m.cancelled ? null : { pcm: m.pcm!, sampleRate: m.sampleRate! });
  }

  protected doLoad(): Promise<void> {
    const w = (this.#worker = this.#channel());
    return new Promise<void>((resolve, reject) => {
      let loaded = false;
      const fail = (message: string) => {
        const err = new Error(message);
        for (const j of this.#jobs.values()) j.reject(err);
        this.#jobs.clear();
        if (this.#worker === w) this.#worker = undefined;
        void w.terminate();
        if (loaded) this.markUnloaded(message);
        else reject(err);
      };
      w.on("message", (m: FromWorker) => {
        if (m.type === "fatal") return fail(m.message);
        if (m.type !== "status") return this.#settle(m);
        if (m.state !== "ready") return this.report({ state: m.state, ...(m.progress !== undefined && { progress: m.progress }), ...(m.detail !== undefined && { detail: m.detail }) });
        loaded = true;
        resolve();
      });
      w.on("error", (e: Error) => fail(e.message));
      w.on("exit", (code) => {
        if (this.#worker === w && code !== 0) fail(`worker exited with code ${code}`);
        else if (!loaded) reject(new Error("worker terminated"));
      });
    });
  }

  protected async doUnload(): Promise<void> {
    const w = this.#worker;
    this.#worker = undefined;
    for (const j of this.#jobs.values()) j.reject(new Error("engine unloaded"));
    this.#jobs.clear();
    if (w) await w.terminate();
  }

  #job(text: string, { voice, speed, signal }: SynthOptions): Promise<Synthesized> {
    const w = this.#worker!;
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (!this.#jobs.delete(id)) return;
        w.post({ type: "cancel", id });
        reject(signal!.reason);
      };
      this.#jobs.set(id, {
        resolve: (r) => {
          signal?.removeEventListener("abort", onAbort);
          if (r) resolve(r);
          else reject(signal?.reason ?? new Error("cancelled"));
        },
        reject: (e) => {
          signal?.removeEventListener("abort", onAbort);
          reject(e);
        },
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      w.post({ type: "synth", id, text, voice, speed });
    });
  }

  protected async doSynthesize(text: string, opts: SynthOptions): Promise<Synthesized> {
    const { voice, signal } = opts;
    if (!KOKORO_VOICES.some((v) => v.id === voice)) throw new Error(`unknown voice "${voice}"`);
    const pieces = splitLong(text, this.#o.maxChunk);
    const parts: Int16Array[] = [];
    for (const p of pieces) {
      signal?.throwIfAborted();
      if (parts.length) parts.push(new Int16Array(GAP_SAMPLES));
      parts.push((await this.#job(p, opts)).pcm);
    }
    if (parts.length === 1) return { pcm: parts[0]!, sampleRate: SAMPLE_RATE };
    const pcm = new Int16Array(parts.reduce((n, a) => n + a.length, 0));
    let at = 0;
    for (const a of parts) {
      pcm.set(a, at);
      at += a.length;
    }
    return { pcm, sampleRate: SAMPLE_RATE };
  }
}
