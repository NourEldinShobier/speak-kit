import { availableParallelism } from "node:os";
import { join } from "node:path";
import { processChannel, type Channel } from "../channel";
import { downloadModel, modelPresent, type DownloadOptions } from "../stt/download";
import { EngineNotReadyError, StatusEmitter, type EngineStatus } from "../types";
import { WRITER_MODEL, type WriterModel } from "./catalog";
import type { WriterFromWorker, WriterToWorker, WriterWorkerInit } from "./worker-protocol";

export interface WriterOptions {
  /** Model cache root; the writer's file lives next to the speech models, in <modelsDir>/stt. */
  modelsDir: string;
  /** Use the graphics card when there is one. Default true. A function is asked again at every load. */
  gpu?: boolean | (() => boolean);
  /** Override the worker entry (needed when this module is bundled). */
  workerUrl?: URL | string;
  /** Injectable for tests; the app passes the browser engine's fetch so the system proxy and certificate store apply. */
  fetch?: DownloadOptions["fetch"];
  /** Injectable for tests: replaces the catalog file. */
  model?: WriterModel;
}

type Host = Channel<WriterToWorker, WriterFromWorker>;
const defaultWorker = () => new URL(import.meta.url.endsWith(".ts") ? "./worker.ts" : "./writer-worker.js", import.meta.url);

/** Rejects with the signal's reason as soon as it fires; otherwise settles like `p`. */
const untilAborted = (p: Promise<unknown>, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
    p.then(() => resolve(), reject).finally(() => signal.removeEventListener("abort", stop));
  });

/**
 * The text model of the rewrite pass (llama.cpp through node-llama-cpp) in a child process, so a native crash cannot take the app down, the
 * blocking inference never runs on the app's main thread, and unloading returns all memory. The model file is downloaded apart from loading:
 * loading a model that is not on disk fails.
 */
export class LocalWriter {
  readonly #o: WriterOptions;
  readonly #model: WriterModel;
  readonly #em = new StatusEmitter({ state: "unloaded" });
  #queue: Promise<unknown> = Promise.resolve();
  #host: Host | undefined;
  #backend: "gpu" | "cpu" | undefined;
  #next = 1;
  readonly #jobs = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();

  constructor(o: WriterOptions) {
    this.#o = o;
    this.#model = o.model ?? WRITER_MODEL;
  }

  status(): EngineStatus {
    return this.#em.status;
  }
  onStatus(cb: (s: EngineStatus) => void): () => void {
    return this.#em.on(cb);
  }
  /** Process id of the model host while one runs. */
  get workerPid(): number | undefined {
    return this.#host?.pid;
  }
  /** Where the loaded model runs; undefined until ready. */
  get backend(): "gpu" | "cpu" | undefined {
    return this.#backend;
  }
  /** A job waits for its answer, or the model is being loaded: nothing may be released under it. */
  get busy(): boolean {
    return this.#jobs.size > 0 || this.#em.status.state === "loading";
  }

  #path(): string {
    return join(this.#o.modelsDir, "stt", this.#model.file);
  }

  /** Whether the model file is on disk at its full size. */
  downloaded(): Promise<boolean> {
    return modelPresent(this.#path(), this.#model);
  }

  /** Resumable, checksummed; rejects with a DownloadError that names the host. */
  download(o: { progress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<void> {
    return downloadModel(this.#model, this.#path(), { ...(o.signal && { signal: o.signal }), ...(o.progress && { onProgress: o.progress }), ...(this.#o.fetch && { fetch: this.#o.fetch }) });
  }

  /** Starts the model host and waits until the model is ready. Idempotent; rejects when the file is missing or the model cannot be loaded. */
  load(): Promise<void> {
    return this.#serial(() => this.#load());
  }

  /** Load in the background: resolves when the model is ready or the attempt failed (the failure is in status()); never rejects. */
  async warm(): Promise<void> {
    try {
      await this.load();
    } catch {
      // the failure is in status()
    }
  }

  unload(): Promise<void> {
    return this.#serial(() => this.#unload());
  }

  /** One tidy-up job: `system` tells the model what to do with `text`. Waits for a load in progress. Rejects with the signal's reason when it fires. */
  async complete({ system, text, signal }: { system: string; text: string; signal: AbortSignal }): Promise<string> {
    signal.throwIfAborted();
    await untilAborted(this.load(), signal);
    const host = this.#host;
    if (this.#em.status.state !== "ready" || !host) throw new EngineNotReadyError(this.#em.status.state);
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (!this.#jobs.delete(id)) return;
        host.post({ type: "abort", id });
        reject(signal.reason);
      };
      const settle =
        <T>(f: (x: T) => void) =>
        (x: T) => {
          signal.removeEventListener("abort", onAbort);
          f(x);
        };
      this.#jobs.set(id, { resolve: settle(resolve), reject: settle(reject) });
      signal.addEventListener("abort", onAbort, { once: true });
      host.post({ type: "rewrite", id, system, text });
    });
  }

  #serial(f: () => Promise<void>): Promise<void> {
    // The second argument keeps the queue moving after a failed step; that step's own caller gets the rejection.
    const run = this.#queue.then(f, f);
    this.#queue = run;
    return run;
  }

  async #load(): Promise<void> {
    if (this.#em.status.state === "ready") return;
    await this.#unload();
    try {
      if (!(await this.downloaded())) throw new Error("the writer model is not downloaded");
      this.#em.set({ state: "loading" });
      await this.#start();
      this.#em.set({ state: "ready", detail: this.#backend! });
    } catch (e) {
      await this.#unload();
      this.#em.set({ state: "error", detail: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  #wantsGpu(): boolean {
    const g = this.#o.gpu;
    return typeof g === "function" ? g() : (g ?? true);
  }

  #start(): Promise<void> {
    const init: WriterWorkerInit = { modelPath: this.#path(), gpu: this.#wantsGpu(), threads: Math.min(8, availableParallelism()) };
    const w = (this.#host = processChannel<WriterToWorker, WriterFromWorker>(this.#o.workerUrl ?? defaultWorker(), init));
    return new Promise((resolve, reject) => {
      let loaded = false;
      const fail = (message: string) => {
        const err = new Error(message);
        this.#failJobs(err);
        if (this.#host === w) this.#host = undefined;
        void w.terminate();
        if (!loaded) return reject(err);
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
        else j.resolve(r.text);
      });
      w.on("error", (e) => fail(e.message));
      w.on("exit", (code) => {
        if (this.#host === w) fail(`writer worker exited with code ${code}`);
        else if (!loaded) reject(new Error("writer worker terminated"));
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
    this.#backend = undefined;
    this.#failJobs(new Error("writer unloaded"));
    if (w) await w.terminate();
    if (this.#em.status.state !== "error" && this.#em.status.state !== "unloaded") this.#em.set({ state: "unloaded" });
  }
}
