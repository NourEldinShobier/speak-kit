import type { AudioTrash, HistoryEntry, HistoryHit, HistoryQuery, HistoryStatus, RemoveReport } from "./history";
import type { HistoryStats } from "./history-search";
import type { Rewriter } from "./modes/rewrite";
import type { CopyReason, PastePlan, Target } from "./paste-plan";
import type { CaretContext } from "./spacing";
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
  /** True while speech is coming in right now; lets the recording run on a little after the key is released. Absent when the recorder cannot tell. */
  speaking?(): boolean;
}

export type TranscribeFailure = "model-missing" | "model-loading" | "model-failed" | "failed";
export type TranscribeResult = { ok: true; text: string; language?: string; model?: string } | { ok: false; code: TranscribeFailure };

export interface Transcriber {
  /** Empty text means no speech was found. */
  transcribe(req: {
    clip: Clip;
    language: string;
    /** Words to bias the model towards; empty when there are none or the switch is off. The port drops it for a model that cannot read one. */ prompt?: string;
  }): Promise<TranscribeResult>;
}

export interface Inserter {
  /** The foreground window now; undefined when there is none. */
  target(): Promise<Target | undefined>;
  /** Brings the window the key was pressed in back to the front and says whether it is in front within a short time. */
  focus?(target: Target): Promise<boolean>;
  /** The character before the caret in the focused field and whether text is selected; undefined when the platform cannot read it. */
  caret?(): Promise<CaretContext | undefined>;
  /** Ends typing that is in progress; the text stays on the clipboard. Called when the cancel key is pressed while the text is going in. */
  cancel?(): void;
  insert(req: { text: string; plan: Exclude<PastePlan, { method: "refuse" }> }): Promise<{ ok: true } | { ok: false; code: "rejected" | "failed" }>;
}

export interface HistoryStorage {
  load(): Promise<unknown>;
  save(value: unknown): Promise<void>;
  /** Keeps a copy of the file as it is, before the app goes on without it (a newer or unreadable file); gives the copy's name. */
  preserve?(reason: "newer" | "unreadable"): Promise<string | undefined | void>;
}

/** Recordings kept next to the history. */
export interface AudioStore extends AudioTrash {
  /** Saves the clip; undefined when it could not be written (the history entry then has no recording). */
  save(id: string, clip: Clip): Promise<string | undefined>;
  load(file: string): Promise<Clip | undefined>;
}

export type DictationErrorCode =
  | MicErrorCode
  | "mic-silent"
  | "model-missing"
  | "model-loading"
  | "model-failed"
  | "transcribe-failed"
  | "insert-failed"
  | "focus-failed"
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
  /** Called with audio that must not be lost: a take that came back silent or a recording cut short. */
  keepClip?(clip: Clip, why: "silent" | "interrupted" | "failed"): void;
  /** Called once a take has been dealt with: `done` when its text is in the history (or there was no speech), false when it failed and the audio is still needed. Lets the app drop the copy of the take it kept on disk. */
  settled?(clip: Clip, done: boolean): void;
  /** One line per stage that failed or ran out of time and passed its input on. Never receives spoken text. */
  log?(stage: string, why: string): void;
  /** Where recordings are kept; without it nothing is recorded whatever the setting says. */
  audio?: AudioStore;
  /** The writer for modes that rewrite; without it a rewrite is skipped. */
  rewriter?: Rewriter;
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
  /** Runs a take found on disk after the app stopped mid-recording through the pipeline. There is no window to paste into, so the text is copied and kept in the history as recovered. */
  restore(clip: Clip): void;
  /** Starts a recording whose text goes to the caller instead of a window. Busy when a recording or a dictation is already running. */
  capture(opts?: { raw?: boolean }): CaptureHandle;
  /** Inserts the newest non-empty history entry into the window in front. "empty": nothing to paste; "copied": it went to the clipboard only; "failed": not even that. */
  pasteLast(): Promise<"pasted" | "copied" | "empty" | "failed">;
  history: {
    list(query?: HistoryQuery): Promise<HistoryHit[]>;
    get(id: string): Promise<HistoryEntry | undefined>;
    /** Puts the saved text on the clipboard. */
    copy(id: string): Promise<boolean>;
    /** Inserts the saved text again into the window in front now, the way a new dictation would; false when it could not be inserted. */
    insert(id: string): Promise<boolean>;
    /** The last `n` texts, newest first, for "Copy recent". */
    recent(n: number): Promise<HistoryEntry[]>;
    remove(id: string): Promise<RemoveReport>;
    removeMany(ids: readonly string[]): Promise<RemoveReport>;
    clear(): Promise<RemoveReport>;
    stats(): Promise<HistoryStats>;
    status(): HistoryStatus;
    preservedAs(): string | undefined;
    addVersion(id: string, v: { model: string; at: number; text: string; ms: number }): Promise<string | undefined>;
    useVersion(id: string, versionId: string): Promise<boolean>;
    /** The kept recording of an entry, or undefined. */
    audio(id: string): Promise<Clip | undefined>;
    dropAudio(files: readonly string[]): Promise<void>;
  };
  dispose(): void;
}
