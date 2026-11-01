import type { EngineReason, EngineState, Voice } from "@speakkit/protocol";
import type { ClonedVoiceStore } from "./chatterbox/voice-store";

export interface EngineStatus {
  state: EngineState;
  /** 0..1, only while downloading. */
  progress?: number;
  detail?: string;
}

export interface SynthOptions {
  voice: string;
  /** Model speed (already clamped to <= 2 by the server). */
  speed: number;
  signal?: AbortSignal;
}

export interface Synthesized {
  pcm: Int16Array;
  sampleRate: number;
}

export interface TtsEngine {
  status(): EngineStatus;
  /** Subscribe to status changes; returns an unsubscribe function. */
  onStatus(cb: (s: EngineStatus) => void): () => void;
  /** Download (if needed) and load the model. Idempotent. Resolves when ready, rejects on failure. */
  start(): Promise<void>;
  voices(): Voice[];
  /** Rejects with EngineNotReadyError unless ready; rejects with the signal's reason when aborted. */
  synthesize(text: string, opts: SynthOptions): Promise<Synthesized>;
  close(): Promise<void>;

  // Lifecycle (additive, optional so minimal engines still satisfy the interface). See lifecycle.ts.
  /** Load ahead of the first request without waiting; no-op while missing/downloading. Idempotent. */
  warm?(): void;
  /** Keep a ready model loaded for at least `ms` more (0 clears). Used while playback is paused. */
  hold?(ms: number): void;
  /** Mark a stream as active (blocks idle unload); call the returned function when it ends. */
  beginStream?(): () => void;
  /** Idle window in ms before a ready model is unloaded; 0 means never. */
  setIdleUnloadMs?(ms: number): void;
  setOnBattery?(onBattery: boolean): void;
  /** Epoch ms at which the model will be unloaded if nothing happens, or undefined. */
  idleUnloadAtMs?(): number | undefined;
  /** Unload now unless busy; returns whether it unloaded. */
  unload?(): Promise<boolean>;
  /** Wait for streams and a load in progress to finish, then unload. Used when another engine is selected. */
  release?(): Promise<void>;

  // Optional engines (Chatterbox).
  /** Why the engine cannot be used, and the detected GPU. */
  info?(): { reason?: EngineReason; gpu?: { name: string; vramMb: number } };
  /** Set the engine up ("installing" then "downloading" states). Resolves when installed. */
  install?(): Promise<void>;
  /** Remove an installed engine and its downloads. */
  remove?(): Promise<void>;
  /** Cloned reference clips, when the engine can clone voices. */
  readonly clones?: ClonedVoiceStore;
  /** Engine does not read digits itself (kokoro's phonemizer does), so text normalization spells numbers out. */
  readonly needsNumberWords?: boolean;
}

export class EngineUnavailableError extends Error {
  reason?: EngineReason;
  constructor(message: string, reason?: EngineReason) {
    super(message);
    this.name = "EngineUnavailableError";
    this.reason = reason;
  }
}

export class EngineNotReadyError extends Error {
  constructor(state: EngineState) {
    super(`engine is ${state}`);
    this.name = "EngineNotReadyError";
  }
}

/** Tiny listener set shared by the engines. */
export class StatusEmitter {
  #status: EngineStatus;
  #cbs = new Set<(s: EngineStatus) => void>();
  constructor(initial: EngineStatus) {
    this.#status = initial;
  }
  get status(): EngineStatus {
    return this.#status;
  }
  set(s: EngineStatus): void {
    this.#status = s;
    for (const cb of this.#cbs) cb(s);
  }
  on(cb: (s: EngineStatus) => void): () => void {
    this.#cbs.add(cb);
    return () => this.#cbs.delete(cb);
  }
}
