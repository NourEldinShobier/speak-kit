import { availableParallelism } from "node:os";
import { join } from "node:path";
import { processChannel, type Channel } from "../channel";
import { EngineNotReadyError, StatusEmitter, type EngineStatus } from "../types";
import { downloadModel, modelPresent, type DownloadOptions } from "./download";
import { STT_MODELS, STT_VAD, type ModelFile, type SttLanguage, type SttModel, type SttModelId } from "./catalog";
import type { SttFromWorker, SttToWorker, SttWorkerInit } from "./worker-protocol";

export interface SttOptions {
  /** Model cache root; speech models live in <modelsDir>/stt. */
  modelsDir: string;
  /** Use the GPU when there is one. Default true. */
  gpu?: boolean;
  /** Override the worker entry (needed when this module is bundled). */
  workerUrl?: URL | string;
  /** Injectable for tests. */
  fetch?: DownloadOptions["fetch"];
  /** Injectable for tests: replaces the catalog files. */
  models?: readonly SttModel[];
  vad?: ModelFile;
}

export interface Transcript {
  text: string;
  /** False when the voice activity gate found no speech; text is then empty. */
  speech: boolean;
}

/** Speech to text for dictation: whole utterances in, text out. */
export interface SpeechToText {
  status(): EngineStatus;
  onStatus(cb: (s: EngineStatus) => void): () => void;
  /** Downloads (resumable, checksummed) and loads `model`; resolves when it is ready. Idempotent; switching models unloads the old one first. */
  load(model: SttModelId, progress?: (fraction: number) => void): Promise<void>;
  /** Load in the background: resolves when the model is ready or the attempt failed (the failure is in status()); never rejects. */
  warm(model: SttModelId): Promise<void>;
  /** `pcm` is 16 kHz mono 16-bit. Rejects with EngineNotReadyError unless ready. */
  transcribe(pcm: Int16Array, language: SttLanguage, signal?: AbortSignal): Promise<Transcript>;
  unload(): Promise<void>;
}

type Host = Channel<SttToWorker, SttFromWorker>;
type HostSpec = Pick<SttWorkerInit, "engine" | "modelPath" | "vadPath">;
const defaultWorker = () => new URL(import.meta.url.endsWith(".ts") ? "./worker.ts" : "./stt-worker.js", import.meta.url);

/** whisper.cpp (Whisper and Parakeet models) in a child process, so a native crash cannot take the app down and unloading returns all memory. */
export class WhisperStt implements SpeechToText {
  #o: SttOptions;
  #vad: ModelFile;
  #em = new StatusEmitter({ state: "unloaded" });
  #queue: Promise<unknown> = Promise.resolve();
  #host: Host | undefined;
  #model: SttModel | undefined;
  #backend: "gpu" | "cpu" | undefined;
  /** Vulkan device index passed to the host: undefined until decided, "" for the default device. */
  #vk: string | undefined;
  #next = 1;
  #jobs = new Map<number, { resolve: (t: Transcript) => void; reject: (e: Error) => void }>();
  #abort: AbortController | undefined;

  constructor(o: SttOptions) {
    this.#o = o;
    this.#vad = o.vad ?? STT_VAD;
  }

  #catalog(id: SttModelId): SttModel {
    const m = (this.#o.models ?? STT_MODELS).find((x) => x.id === id);
    if (!m) throw new Error(`unknown speech model "${id}"`);
    return m;
  }

  status(): EngineStatus {
    return this.#em.status;
  }
  onStatus(cb: (s: EngineStatus) => void): () => void {
    return this.#em.on(cb);
  }
  /** Process id of the model host while one runs (for memory measurements and tests). */
  get workerPid(): number | undefined {
    return this.#host?.pid;
  }
  /** Vulkan device the host was pinned to ("" for the default one); undefined until a model has loaded. */
  get gpuDevice(): string | undefined {
    return this.#vk;
  }
  /** Where the loaded model runs; undefined until ready. */
  get backend(): "gpu" | "cpu" | undefined {
    return this.#backend;
  }

  /** Whether the model and the VAD file are already on disk (no download needed). */
  async downloaded(id: SttModelId): Promise<boolean> {
    const dir = this.#dir();
    const m = this.#catalog(id);
    return (await modelPresent(join(dir, m.file), m)) && (await modelPresent(join(dir, this.#vad.file), this.#vad));
  }

  load(id: SttModelId, progress?: (fraction: number) => void): Promise<void> {
    return this.#serial(() => this.#load(this.#catalog(id), progress));
  }

  async warm(id: SttModelId): Promise<void> {
    try {
      await this.load(id);
    } catch {
      // the failure is in status()
    }
  }

  unload(): Promise<void> {
    this.#abort?.abort(new Error("unloaded"));
    return this.#serial(() => this.#unload());
  }

  transcribe(pcm: Int16Array, language: SttLanguage, signal?: AbortSignal): Promise<Transcript> {
    const host = this.#host;
    const m = this.#model;
    if (this.#em.status.state !== "ready" || !host || !m) return Promise.reject(new EngineNotReadyError(this.#em.status.state));
    if (!m.languages.includes(language)) return Promise.reject(new Error(`${m.label} does not support language "${language}"`));
    signal?.throwIfAborted();
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        // The worker finishes the job (under half a second) and its answer is dropped.
        if (this.#jobs.delete(id)) reject(signal!.reason);
      };
      const settle =
        <T>(f: (x: T) => void) =>
        (x: T) => {
          signal?.removeEventListener("abort", onAbort);
          f(x);
        };
      this.#jobs.set(id, { resolve: settle(resolve), reject: settle(reject) });
      signal?.addEventListener("abort", onAbort, { once: true });
      host.post({ type: "transcribe", id, pcm, language });
    });
  }

  #dir(): string {
    return join(this.#o.modelsDir, "stt");
  }

  #serial(f: () => Promise<void>): Promise<void> {
    // The second argument keeps the queue moving after a failed step; that step's own caller gets the rejection.
    const run = this.#queue.then(f, f);
    this.#queue = run;
    return run;
  }

  async #load(m: SttModel, progress?: (fraction: number) => void): Promise<void> {
    if (this.#em.status.state === "ready" && this.#model === m) return;
    await this.#unload();
    const dir = this.#dir();
    const ac = (this.#abort = new AbortController());
    try {
      const dl = { signal: ac.signal, ...(this.#o.fetch && { fetch: this.#o.fetch }) };
      this.#em.set({ state: "downloading", progress: 0, detail: this.#vad.file });
      await downloadModel(this.#vad, join(dir, this.#vad.file), dl);
      const onProgress = (p: number) => {
        this.#em.set({ state: "downloading", progress: p, detail: m.file });
        progress?.(p);
      };
      await downloadModel(m, join(dir, m.file), { ...dl, onProgress });
      this.#em.set({ state: "loading" });
      await this.#bringUp({ engine: m.engine, modelPath: join(dir, m.file), vadPath: join(dir, this.#vad.file) });
      this.#model = m;
      this.#em.set({ state: "ready", detail: this.#backend! });
    } catch (e) {
      await this.#unload();
      this.#em.set(ac.signal.aborted ? { state: "unloaded" } : { state: "error", detail: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      this.#abort = undefined;
    }
  }

  /**
   * Starts the host and, on a machine with an integrated and a discrete GPU, makes sure it runs on the discrete one. The binding has no device
   * option and whisper.cpp takes the first Vulkan device, which is the integrated GPU there (10x slower, measured), so the host is restarted with
   * GGML_VK_VISIBLE_DEVICES set to each other device until one reports itself discrete. The answer is kept for later loads.
   */
  async #bringUp(spec: HostSpec): Promise<void> {
    const first = await this.#start(spec, this.#vk ?? "");
    if (this.#vk !== undefined || first.gpuKind !== "integrated") return void (this.#vk ??= "");
    for (let i = 1; i < (first.devices ?? 0) - 1; i++) {
      await this.#stopHost();
      const probe = await this.#start(spec, String(i), false);
      if (probe.gpuKind === "discrete") return void (this.#vk = String(i));
    }
    this.#vk = ""; // no discrete GPU after all: the default device it is
    if (first.devices && first.devices > 2) {
      await this.#stopHost();
      await this.#start(spec, "");
    }
  }

  async #stopHost(): Promise<void> {
    const w = this.#host;
    this.#host = undefined;
    if (w) await w.terminate();
  }

  #start(spec: HostSpec, vk: string, warmup = true): Promise<Extract<SttFromWorker, { state: "ready" }>> {
    const init: SttWorkerInit = { ...spec, gpu: this.#o.gpu ?? true, threads: Math.min(8, availableParallelism()), warmup };
    const w = (this.#host = processChannel<SttToWorker, SttFromWorker>(this.#o.workerUrl ?? defaultWorker(), init, vk ? { GGML_VK_VISIBLE_DEVICES: vk } : {}));
    return new Promise((resolve, reject) => {
      let loaded = false;
      const fail = (message: string) => {
        const err = new Error(message);
        this.#failJobs(err);
        if (this.#host === w) this.#host = undefined;
        void w.terminate();
        if (!loaded) return reject(err);
        this.#model = undefined;
        this.#backend = undefined;
        this.#em.set({ state: "unloaded", detail: message });
      };
      w.on("message", (r) => {
        if (r.type === "fatal") return fail(r.message);
        if (r.type === "status") {
          if (r.state === "ready") {
            loaded = true;
            this.#backend = r.backend;
            resolve(r);
          }
          return;
        }
        const j = this.#jobs.get(r.id);
        if (!j) return; // aborted by the caller
        this.#jobs.delete(r.id);
        if (r.type === "error") j.reject(new Error(r.message));
        else j.resolve({ text: r.text, speech: r.speech });
      });
      w.on("error", (e) => fail(e.message));
      w.on("exit", (code) => {
        if (this.#host === w) fail(`speech worker exited with code ${code}`);
        else if (!loaded) reject(new Error("speech worker terminated"));
      });
    });
  }

  #failJobs(err: Error): void {
    for (const j of this.#jobs.values()) j.reject(err);
    this.#jobs.clear();
  }

  async #unload(): Promise<void> {
    const w = this.#host;
    this.#host = undefined;
    this.#model = undefined;
    this.#backend = undefined;
    this.#failJobs(new Error("speech engine unloaded"));
    if (w) await w.terminate();
    if (this.#em.status.state !== "error" && this.#em.status.state !== "unloaded") this.#em.set({ state: "unloaded" });
  }
}
