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
  /** Use the GPU when there is one. Default true. A function is asked again at every load, so a device choice takes effect on the next load. */
  gpu?: boolean | (() => boolean);
  /** Models the person added from files, merged with the catalog; asked at every lookup. */
  extraModels?: () => readonly SttModel[];
  /** Loading on the graphics card failed and the model runs on the CPU instead; `message` is why. */
  onGpuFallback?: (message: string) => void;
  /** Auto with only an integrated card: when this returns true the first load times that card against the CPU and keeps the faster one. */
  timeIntegrated?: () => boolean;
  /** The outcome of that timing. */
  onTimed?: (winner: "gpu" | "cpu", gpuMs: number, cpuMs: number) => void;
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
  /** Downloads (resumable, checksummed) without loading; independent of the model in use. Rejects with a DownloadError that names the host. */
  download(model: SttModelId, o?: { progress?: (fraction: number) => void; signal?: AbortSignal }): Promise<void>;
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
    const m = [...(this.#o.models ?? STT_MODELS), ...(this.#o.extraModels?.() ?? [])].find((x) => x.id === id);
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

  /** Jobs that were sent to the model and have not answered. */
  get pending(): number {
    return this.#jobs.size;
  }
  /** A job is queued, or a model is being loaded: nothing may be released under it. */
  get busy(): boolean {
    const s = this.#em.status.state;
    return this.#jobs.size > 0 || s === "loading" || s === "downloading";
  }
  /** The model that is loaded and ready; undefined when none. */
  get loaded(): SttModelId | undefined {
    return this.#em.status.state === "ready" ? this.#model?.id : undefined;
  }

  async download(id: SttModelId, o: { progress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<void> {
    const m = this.#catalog(id);
    const dir = this.#dir();
    const dl = { ...(o.signal && { signal: o.signal }), ...(this.#o.fetch && { fetch: this.#o.fetch }) };
    await downloadModel(this.#vad, join(dir, this.#vad.file), dl);
    await downloadModel(m, join(dir, m.file), { ...dl, ...(o.progress && { onProgress: o.progress }) });
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
    const timing = this.#wantsGpu() && !!this.#o.timeIntegrated?.();
    const t0 = Date.now();
    const first = await this.#start(spec, this.#vk ?? "");
    if (first.gpuFallback) this.#o.onGpuFallback?.(first.gpuFallback);
    if (timing && first.gpuKind === "integrated" && first.backend === "gpu") return this.#timeAgainstCpu(spec, first.warmupMs ?? Date.now() - t0);
    if (this.#vk !== undefined || first.gpuKind !== "integrated") return void (this.#vk ??= "");
    await this.#pickDiscrete(spec, first.devices ?? 0);
  }

  /** The host runs on the integrated card: restart it on each other device until one is discrete. */
  async #pickDiscrete(spec: HostSpec, devices: number): Promise<void> {
    for (let i = 1; i < devices - 1; i++) {
      await this.#stopHost();
      const probe = await this.#start(spec, String(i), { warmup: false });
      if (probe.gpuKind === "discrete") return void (this.#vk = String(i));
    }
    this.#vk = ""; // no discrete GPU after all: the default device it is
    if (devices > 2) {
      await this.#stopHost();
      await this.#start(spec, "");
    }
  }

  /** An integrated card is not always faster than the CPU: run the same warm-up on the CPU and keep the host that answers sooner. */
  async #timeAgainstCpu(spec: HostSpec, gpuMs: number): Promise<void> {
    await this.#stopHost();
    const cpu = await this.#start(spec, "", { gpu: false });
    const cpuMs = cpu.warmupMs ?? Number.MAX_SAFE_INTEGER;
    const winner = cpuMs * 0.8 < gpuMs ? "cpu" : "gpu";
    this.#o.onTimed?.(winner, gpuMs, cpuMs);
    if (winner === "gpu") {
      await this.#stopHost();
      await this.#start(spec, this.#vk ?? "");
    }
    this.#vk ??= "";
  }

  async #stopHost(): Promise<void> {
    const w = this.#host;
    this.#host = undefined;
    if (w) await w.terminate();
  }

  #wantsGpu(): boolean {
    const g = this.#o.gpu;
    return typeof g === "function" ? g() : (g ?? true);
  }

  #start(spec: HostSpec, vk: string, o: { warmup?: boolean; gpu?: boolean } = {}): Promise<Extract<SttFromWorker, { state: "ready" }>> {
    const init: SttWorkerInit = { ...spec, gpu: o.gpu ?? this.#wantsGpu(), threads: Math.min(8, availableParallelism()), warmup: o.warmup ?? true };
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
