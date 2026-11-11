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
      await this.#start(m, join(dir, m.file), join(dir, this.#vad.file));
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

  #start(m: SttModel, modelPath: string, vadPath: string): Promise<void> {
    const init: SttWorkerInit = { engine: m.engine, modelPath, vadPath, gpu: this.#o.gpu ?? true, threads: Math.min(8, availableParallelism()) };
    const w = (this.#host = processChannel<SttToWorker, SttFromWorker>(this.#o.workerUrl ?? defaultWorker(), init));
    return new Promise<void>((resolve, reject) => {
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
            resolve();
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
