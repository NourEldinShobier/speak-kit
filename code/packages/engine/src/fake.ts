import { SAMPLE_RATE, type Voice } from "@speakkit/protocol";
import { KOKORO_VOICES } from "./voices";
import { LifecycleEngine, type LifecycleOptions } from "./lifecycle";
import type { EngineStatus, SynthOptions, Synthesized } from "./types";

export interface FakeEngineOptions extends LifecycleOptions {
  /** Simulated model load time in ms. Default 0. */
  loadMs?: number;
  /** Delay before each synthesis resolves. */
  latencyMs?: number;
  /** Seconds of audio per character at speed 1. Default 0.06 (about 16 chars/s). */
  secondsPerChar?: number;
  /** Initial state. Default "ready" (no lifecycle surprises in tests); "unloaded" loads on first use. Others stay until setStatus() or start(). */
  state?: EngineStatus["state"];
  /** Fail synthesis for texts for which this returns true (or always when true). */
  failOn?: boolean | ((text: string) => boolean);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Deterministic engine for tests: a sine tone whose length is proportional to characters / speed. */
export class FakeEngine extends LifecycleEngine {
  loadMs: number;
  /** Model loads and unloads performed. */
  loads = 0;
  unloads = 0;
  #loaded = false;
  latencyMs: number;
  secondsPerChar: number;
  failOn: boolean | ((text: string) => boolean);
  /** Every synthesize() call, in order. */
  readonly calls: { text: string; voice: string; speed: number }[] = [];
  /** Calls currently in flight, and how many ended by abort. */
  active = 0;
  aborted = 0;
  completed = 0;

  constructor(o: FakeEngineOptions = {}) {
    super(o, o.state ?? "ready");
    this.loadMs = o.loadMs ?? 0;
    this.#loaded = (o.state ?? "ready") === "ready";
    this.latencyMs = o.latencyMs ?? 0;
    this.secondsPerChar = o.secondsPerChar ?? 0.06;
    this.failOn = o.failOn ?? false;
  }

  protected async doLoad(): Promise<void> {
    await sleep(this.loadMs);
    this.loads++;
    this.#loaded = true;
  }
  protected async doUnload(): Promise<void> {
    if (!this.#loaded) return;
    this.#loaded = false;
    this.unloads++;
  }

  voices(): Voice[] {
    return KOKORO_VOICES;
  }

  /** Samples produced for `text` at `speed`. */
  static sampleCount(text: string, speed: number, secondsPerChar = 0.06): number {
    return Math.max(1, Math.round((text.length * secondsPerChar * SAMPLE_RATE) / speed));
  }

  protected async doSynthesize(text: string, { voice, speed, signal }: SynthOptions): Promise<Synthesized> {
    this.calls.push({ text, voice, speed });
    this.active++;
    try {
      await sleep(this.latencyMs, signal);
      const fail = typeof this.failOn === "function" ? this.failOn(text) : this.failOn;
      if (fail) throw new Error("fake engine failure");
      const n = FakeEngine.sampleCount(text, speed, this.secondsPerChar);
      let h = 0;
      for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
      const w = (2 * Math.PI * (200 + (h % 40) * 10)) / SAMPLE_RATE;
      const ramp = Math.min(240, n >> 1);
      const pcm = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const env = Math.min(1, i / ramp, (n - 1 - i) / ramp);
        pcm[i] = Math.round(Math.sin(w * i) * 0.3 * env * 0x7fff);
      }
      this.completed++;
      return { pcm, sampleRate: SAMPLE_RATE };
    } catch (e) {
      if (signal?.aborted) this.aborted++;
      throw e;
    } finally {
      this.active--;
    }
  }
}
