import { freemem } from "node:os";
import type { EngineState, Voice } from "@speakkit/protocol";
import {
  EngineNotReadyError,
  StatusEmitter,
  type EngineStatus,
  type SynthOptions,
  type Synthesized,
  type TtsEngine,
} from "./types";

export interface LifecycleOptions {
  /** Idle window before a ready model is unloaded. 0 = never. Default 5 min. */
  idleUnloadMs?: number;
  /** Shorter window used while on battery (only when the idle window is finite). Default 1 min. */
  batteryIdleMs?: number;
  /** Unload early when os.freemem() is below this. Default 1 GiB. */
  lowMemBytes?: number;
  /** Idle time required before a low-memory unload (avoids unload right after a load). Default 30 s. */
  lowMemGraceMs?: number;
  /** How often free memory is polled while a model sits idle. Default 15 s. */
  checkIntervalMs?: number;
  /** Injectable for tests. */
  freemem?: () => number;
  onBattery?: boolean;
}

export const DEFAULT_IDLE_MS = 5 * 60_000;
const MAX_TIMER = 2 ** 31 - 1;

function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const on = () => reject(signal.reason);
    signal.addEventListener("abort", on, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", on));
  });
}

/**
 * Shared model lifecycle: lazy load, requests wait for a load in progress, idle/battery/low-memory
 * unload, hold while paused, and never unloading under an active stream or call.
 * States: missing -> downloading -> (loading) -> ready -> unloaded -> loading -> ready.
 * Subclasses implement doLoad (may report "downloading"/"loading" progress), doUnload, doSynthesize.
 */
export abstract class LifecycleEngine implements TtsEngine {
  #em: StatusEmitter;
  #loading?: Promise<void>;
  #unloading?: Promise<void>;
  #streams = 0;
  #inflight = 0;
  #lastActivity = Date.now();
  #holdUntil = 0;
  #idleMs: number;
  #batteryIdleMs: number;
  #onBattery: boolean;
  #lowMemBytes: number;
  #lowMemGraceMs: number;
  #checkMs: number;
  #freemem: () => number;
  #timer?: ReturnType<typeof setTimeout>;
  #poll?: ReturnType<typeof setInterval>;
  #closed = false;

  constructor(o: LifecycleOptions = {}, initial: EngineState = "unloaded") {
    this.#idleMs = o.idleUnloadMs ?? DEFAULT_IDLE_MS;
    this.#batteryIdleMs = o.batteryIdleMs ?? 60_000;
    this.#onBattery = o.onBattery ?? false;
    this.#lowMemBytes = o.lowMemBytes ?? 1024 ** 3;
    this.#lowMemGraceMs = o.lowMemGraceMs ?? 30_000;
    this.#checkMs = o.checkIntervalMs ?? 15_000;
    this.#freemem = o.freemem ?? freemem;
    this.#em = new StatusEmitter({ state: initial });
    if (initial === "ready") this.#reschedule();
  }

  protected abstract doLoad(): Promise<void>;
  /** Must be safe to call when nothing is loaded. */
  protected abstract doUnload(): Promise<void>;
  protected abstract doSynthesize(text: string, opts: SynthOptions): Promise<Synthesized>;
  abstract voices(): Voice[];

  status(): EngineStatus {
    return this.#em.status;
  }
  onStatus(cb: (s: EngineStatus) => void): () => void {
    return this.#em.on(cb);
  }
  /** Progress reports from doLoad ("downloading" / "loading"). */
  protected report(s: EngineStatus): void {
    if (!this.#closed) this.#em.set(s);
  }
  /** Forces a status (tests, pinned states). Re-evaluates the idle timer. */
  setStatus(s: EngineStatus): void {
    this.#em.set(s);
    this.#reschedule();
  }
  /** For subclasses: the loaded model vanished (worker crash). The next request reloads it. */
  protected markUnloaded(detail?: string): void {
    if (this.#em.status.state === "ready") this.setStatus({ state: "unloaded", detail });
  }

  start(): Promise<void> {
    if (this.#em.status.state === "ready") return Promise.resolve();
    return (this.#loading ??= this.#load().finally(() => {
      this.#loading = undefined;
    }));
  }

  async #load(): Promise<void> {
    this.#em.set({ state: "loading" });
    await this.#unloading;
    if (this.#closed) throw new Error("engine closed");
    try {
      await this.doLoad();
    } catch (e) {
      if (!this.#closed)
        this.#em.set({ state: "error", detail: e instanceof Error ? e.message : String(e) });
      throw e;
    }
    if (this.#closed) throw new Error("engine closed");
    this.#lastActivity = Date.now();
    this.#em.set({ state: "ready" });
    this.#reschedule();
  }

  warm(): void {
    const st = this.#em.status.state;
    if (st === "ready") return this.#touch();
    if (st === "unloaded" || st === "error") this.start().catch(() => {});
  }

  hold(ms: number): void {
    this.#holdUntil = ms > 0 ? Date.now() + ms : 0;
    this.#reschedule();
  }

  beginStream(): () => void {
    this.#streams++;
    this.#reschedule();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.#streams--;
      this.#touch();
    };
  }

  setIdleUnloadMs(ms: number): void {
    this.#idleMs = ms;
    this.#reschedule();
  }
  get idleUnloadMs(): number {
    return this.#idleMs;
  }
  setOnBattery(b: boolean): void {
    this.#onBattery = b;
    this.#reschedule();
  }

  idleUnloadAtMs(): number | undefined {
    return this.#deadline();
  }

  #touch(): void {
    this.#lastActivity = Date.now();
    this.#reschedule();
  }
  #busy(): boolean {
    return this.#streams > 0 || this.#inflight > 0;
  }
  #deadline(): number | undefined {
    if (this.#em.status.state !== "ready" || this.#busy() || this.#idleMs <= 0) return undefined;
    const ms = this.#onBattery ? Math.min(this.#idleMs, this.#batteryIdleMs) : this.#idleMs;
    return Math.max(this.#lastActivity + ms, this.#holdUntil);
  }
  #reschedule(): void {
    clearTimeout(this.#timer);
    clearInterval(this.#poll);
    this.#timer = this.#poll = undefined;
    if (this.#closed) return;
    const d = this.#deadline();
    if (d === undefined) return;
    this.#timer = setTimeout(
      () => {
        const d2 = this.#deadline();
        if (d2 === undefined) return;
        if (d2 > Date.now()) return this.#reschedule();
        void this.unload();
      },
      Math.min(MAX_TIMER, Math.max(0, d - Date.now())),
    );
    this.#timer.unref();
    this.#poll = setInterval(() => {
      if (
        this.#deadline() !== undefined &&
        Date.now() - this.#lastActivity >= this.#lowMemGraceMs &&
        this.#freemem() < this.#lowMemBytes
      )
        void this.unload();
    }, this.#checkMs);
    this.#poll.unref();
  }

  async unload(): Promise<boolean> {
    if (this.#em.status.state !== "ready" || this.#busy()) return false;
    this.setStatus({ state: "unloaded" });
    this.#unloading = this.doUnload().finally(() => {
      this.#unloading = undefined;
    });
    await this.#unloading;
    return true;
  }

  async #ensureReady(signal?: AbortSignal): Promise<void> {
    const st = this.#em.status.state;
    if (st === "ready") return;
    const waits = st === "unloaded" || (this.#loading !== undefined && st !== "downloading");
    if (!waits) throw new EngineNotReadyError(st);
    signal?.throwIfAborted();
    let p = this.start().catch(() => {
      throw new EngineNotReadyError("error");
    });
    if (signal) p = raceAbort(p, signal);
    await p;
    const now = this.#em.status.state;
    if (now !== "ready") throw new EngineNotReadyError(now);
  }

  async synthesize(text: string, opts: SynthOptions): Promise<Synthesized> {
    this.#inflight++;
    this.#reschedule();
    try {
      await this.#ensureReady(opts.signal);
      return await this.doSynthesize(text, opts);
    } finally {
      this.#inflight--;
      this.#touch();
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    clearTimeout(this.#timer);
    clearInterval(this.#poll);
    await this.#unloading;
    await this.doUnload();
  }
}
