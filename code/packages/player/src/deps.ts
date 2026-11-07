import type { EngineState, PlayerState, SentenceStart } from "@speakkit/protocol";
import type { QueueItem } from "./types";

// Minimal Web Audio surface so the logic can run against a mock in tests.
export interface BufferLike {
  getChannelData(ch: number): Float32Array;
}
export interface SourceLike {
  buffer: BufferLike | null;
  playbackRate: { value: number };
  connect(node: unknown): unknown;
  disconnect?(): void;
  start(when: number): void;
  stop(): void;
}
export interface CtxLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
  createBufferSource(): SourceLike;
  createAnalyser?(): unknown;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close?(): Promise<void>;
}

/** Pitch-preserving time stretch for speeds above 2x (SoundTouch in an AudioWorklet). */
export interface StretchNode {
  /** the real AudioNode that sources connect to (AudioNode.connect rejects wrapper objects) */
  readonly input: unknown;
  connect(node: unknown): unknown;
  disconnect(): void;
  /** the playbackRate the sources feed it with; the node corrects the pitch back */
  setRate(rate: number): void;
}
export interface StretchDeps {
  /** load the worklet module on this context (called once per context, awaited before the first stretched buffer) */
  register(ctx: CtxLike): Promise<void>;
  create(ctx: CtxLike): StretchNode;
}

export interface PlayerDeps {
  createContext(): CtxLike;
  fetch: typeof fetch;
  emitState(state: PlayerState): void;
  emitSentence(start: SentenceStart, tabId: number | undefined): void;
  emitQueue?(queue: QueueItem[]): void;
  /** override to drive ticks manually in tests */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
  now?: () => number;
  stretch?: StretchDeps;
  /** POST /v1/engine/hold: keep the model while paused (ms), 0 to release */
  hold?: (ms: number) => void;
  /** health engine state, to tell "loading" (wait) from "missing" (fail) */
  engineState?: () => Promise<EngineState | undefined>;
  sleep?: (ms: number) => Promise<void>;
  /** playback has been stopped for IDLE_CLOSE_MS and nothing is queued: the host may close the document */
  onIdle?: () => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
}
