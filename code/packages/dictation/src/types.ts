import type { HistoryEntry } from "./history";
import type { CopyReason, PastePlan, Target } from "./paste-plan";
import type { Settings } from "./settings";

export type Unsubscribe = () => void;

/** Time and timers, so nothing here reads the real clock. */
export interface Clock {
  now(): number;
  after(ms: number, fn: () => void): Unsubscribe;
}

/** `at` is the moment the key changed, in the same milliseconds as `Clock.now()`. */
export interface KeyEvent {
  key: string;
  down: boolean;
  at: number;
}

export interface HotkeySource {
  /**
   * Starts delivering key events once the hook is installed. The handler returns true when dictation consumed the event
   * (the hotkey, or the cancel key during a toggled recording); the source then keeps it from the focused app unless it is a bare modifier.
   */
  subscribe(handler: (event: KeyEvent) => boolean): Promise<Unsubscribe>;
}

/** Mono audio at `sampleRate`; `peak` is the loudest sample (0 to 1). `interrupted` means the microphone stopped before the key was released. */
export interface Clip {
  pcm: Float32Array;
  sampleRate: number;
  peak: number;
  interrupted?: boolean;
}

export type MicErrorCode = "mic-denied" | "mic-missing" | "mic-busy" | "mic-failed";

export interface Recorder {
  /** Opens the microphone and keeps the last `prerollMs` before now. */
  start(req: { prerollMs: number }): Promise<{ ok: true } | { ok: false; code: MicErrorCode }>;
  stop(): Promise<Clip>;
  discard(): Promise<void>;
}

export type TranscribeFailure = "model-missing" | "model-loading" | "model-failed" | "failed";
export type TranscribeResult = { ok: true; text: string; language?: string; model?: string } | { ok: false; code: TranscribeFailure };

export interface Transcriber {
  /** Empty text means no speech was found. */
  transcribe(req: { clip: Clip; language: string }): Promise<TranscribeResult>;
}

export interface Inserter {
  /** The foreground window now; undefined when there is none. */
  target(): Promise<Target | undefined>;
  insert(req: { text: string; plan: Exclude<PastePlan, { method: "refuse" }> }): Promise<{ ok: true } | { ok: false; code: "rejected" | "failed" }>;
}

export interface HistoryStorage {
  load(): Promise<unknown>;
  save(value: unknown): Promise<void>;
}

export type DictationErrorCode =
  | MicErrorCode
  | "mic-silent"
  | "model-missing"
  | "model-loading"
  | "model-failed"
  | "transcribe-failed"
  | "insert-failed"
  | "password-field"
  | "hotkey-failed"
  /** Another feature holds the microphone; the state names it in `owner`. */
  | "mic-in-use"
  | "failed";

export type Notice = { kind: "inserted" } | { kind: "cancelled"; undoable?: true } | { kind: "copied"; reason: CopyReason } | { kind: "no-speech" };

export type DictationState =
  | { status: "idle"; notice?: Notice }
  | { status: "recording"; mode: "hold" | "toggle" }
  | { status: "locked" }
  | { status: "transcribing" }
  | { status: "pasting" }
  | { status: "error"; code: DictationErrorCode; owner?: string };

export interface DictationDeps {
  clock: Clock;
  recorder: Recorder;
  transcriber: Transcriber;
  inserter: Inserter;
  hotkeys: HotkeySource;
  storage: HistoryStorage;
  /** Starting values; later changes go through `configure`. Missing keys take `defaultSettings`. */
  settings?: Partial<Settings>;
  /** The feature that holds the microphone right now (voice chat, a screen look, a capture), or undefined when it is free. Dictation does not start while one does. */
  micOwner?: () => string | undefined;
}

/** How a capture ends: the text, or why there is none. */
export type CaptureResult = { ok: true; text: string } | { ok: false; code: "no-speech" | "cancelled" | "busy" | DictationErrorCode };

/** A recording owned by a command: it ends with the result below however it ends (finished, cancelled, a hotkey, a failure), and nothing is pasted. */
export interface CaptureHandle {
  result: Promise<CaptureResult>;
  /** Ends the recording and transcribes it. */
  finish(): void;
  cancel(): void;
}

export interface Dictation {
  state(): DictationState;
  subscribe(listener: (state: DictationState) => void): Unsubscribe;
  /** Resolves true once the hotkey is live; false (and the state is an error) when the hook could not be installed. */
  ready(): Promise<boolean>;
  /** Applies at once, also while a recording runs. */
  configure(patch: Partial<Settings>): void;
  /** The same actions as the hotkey, for buttons and scripts. Start begins a toggled recording. */
  start(): void;
  stop(): void;
  cancel(): void;
  /** Runs the recording that was cancelled in the last minute through the pipeline. False when there is none. */
  undoCancel(): boolean;
  /** Starts a recording whose text goes to the caller instead of a window. Busy when a recording or a dictation is already running. */
  capture(opts?: { raw?: boolean }): CaptureHandle;
  /** Inserts the newest non-empty history entry into the window in front. "empty": nothing to paste; "copied": it went to the clipboard only; "failed": not even that. */
  pasteLast(): Promise<"pasted" | "copied" | "empty" | "failed">;
  history: {
    list(query?: { search?: string; limit?: number }): Promise<HistoryEntry[]>;
    /** Puts the saved text on the clipboard. */
    copy(id: string): Promise<boolean>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
  };
  dispose(): void;
}
