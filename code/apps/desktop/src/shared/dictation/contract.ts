import * as v from "valibot";
import type { DictationConfig, DictationModelId } from "./settings";
import { DICTATION_MODELS, DictationPatchSchema } from "./settings";
import { HUD_ACTIONS, type DictationMethod, type HudAction } from "./channels";
import type { HistoryStats, RewriteOutcome } from "@speakkit/dictation";

export type { DictationMethod, HudAction } from "./channels";
export type { DictationModelId } from "./settings";

/** What the person sees of one speech model. */
export interface ModelView {
  id: DictationModelId;
  name: string;
  /** "Accurate" or "Fast". */
  tag: string;
  description: string;
  bytes: number;
  installed: boolean;
  /** The model dictation uses. */
  selected: boolean;
  /** Languages it understands. */
  languages: string[];
  progress?: { kind: "downloading"; fraction: number; etaSeconds?: number } | { kind: "preparing" };
}

export type DictationPhase = "idle" | "recording" | "locked" | "transcribing" | "pasting" | "error";

export interface DictationStatus {
  /** False where the key hook is not built yet (macOS, Linux): dictation can be set up but not started. */
  supported: boolean;
  enabled: boolean;
  /** The hotkey is live. */
  hotkeyReady: boolean;
  /** The hotkey could not start or stopped working and could not be reinstalled: the Settings page says so. */
  hotkeyFailed?: boolean;
  phase: DictationPhase;
  /** Error code while `phase` is "error". */
  error?: string;
  settings: DictationConfig;
  models: ModelView[];
  /** The selected model is on disk. */
  modelInstalled: boolean;
  /** The selected model is loaded and can transcribe. */
  modelReady: boolean;
  /** The model failed to download or load. */
  modelError?: string;
  historyCount: number;
  /** "newer": history.json was written by a newer Speak Kit; it is left unchanged, a copy was made, and nothing is saved this session. */
  historyStatus: "ok" | "newer";
  /** Recordings the Recycle Bin would not take: they are still on disk. */
  keptRecordings: number;
  /** An OpenAI key is saved, so the rewrite pass can run. */
  rewriteKey: boolean;
  /** The speech model in use cannot read the word list, so it was left out of the last dictation; the words still work through replacements. */
  promptDropped?: boolean;
  /** "Transcribe again" for one entry, while it runs or after it failed; absent otherwise. */
  redo?: { id: string; model: DictationModelId; state: "running" | "failed"; error?: "model-missing" | "failed" | "no-audio" };
}

export interface HistoryVersion {
  id: string;
  model: string;
  at: number;
  text: string;
  ms: number;
}

export interface HistoryItem {
  id: string;
  at: number;
  text: string;
  app?: string;
  /** What the speech model heard, before the clean-up. */
  raw: string;
  model?: string;
  durationMs: number;
  rewrite?: RewriteOutcome;
  /** Milliseconds until the entry is removed; null when it is kept for ever. */
  expiresInMs: number | null;
  /** The entry has a kept recording. */
  recording?: boolean;
  recordingRemoved?: boolean;
  versions?: HistoryVersion[];
  /** The version in use. */
  version?: string;
  /** The search matched this vocabulary word through one of its sounds-like spellings. */
  via?: { word: string; heard: string };
}

export type { HistoryStats };

/** What the HUD page draws. */
export type HudView =
  | { kind: "ready"; hotkey: string }
  | { kind: "recording"; locked: boolean; startedAt: number; level: number; hotkey: string }
  | { kind: "transcribing" }
  | { kind: "pasted" }
  | { kind: "copied"; reason: "clipboard" | "elevated" }
  | { kind: "notice"; text: string }
  | { kind: "error"; text: string; icon: "microphone-off" | "download" | "alert-triangle" | "shield-check" | "lock"; action?: { label: string; id: HudAction } };

export interface DictationBridge {
  status(): Promise<DictationStatus>;
  setEnabled(on: boolean): Promise<DictationStatus>;
  patchSettings(patch: import("./settings").DictationPatch): Promise<DictationStatus>;
  /** Downloads the model if needed, then makes it the one dictation uses. */
  downloadModel(id: DictationModelId): Promise<DictationStatus>;
  cancelDownload(): Promise<DictationStatus>;
  historyList(search?: string): Promise<HistoryItem[]>;
  historyCopy(id: string): Promise<boolean>;
  historyRemove(id: string): Promise<void>;
  historyClear(): Promise<void>;
  historyStats(): Promise<HistoryStats>;
  /** The last `n` entries, newest first. */
  historyRecent(n: number): Promise<HistoryItem[]>;
  historyUseVersion(id: string, versionId: string): Promise<boolean>;
  /** Transcribes the kept recording again with `model`; progress and failure arrive in the status (`redo`). */
  historyRetranscribe(id: string, model: DictationModelId): Promise<void>;
  historyCancelRetranscribe(): Promise<void>;
  /** The kept recording as a WAV file's bytes; null when there is none. */
  historyAudio(id: string): Promise<Uint8Array | null>;
  historyDeleteRecording(id: string): Promise<void>;
  /** Saves the history as a JSON file the person chooses; the path, or null when cancelled. */
  historyExport(): Promise<string | null>;
  /** Hides the Recycle Bin and newer-file notices. */
  historyDismissNotice(): Promise<void>;
  /** Asks for a file to import; null when cancelled. */
  vocabImport(): Promise<{ format: "json" | "txt" | "csv"; text: string; name: string } | null>;
  /** Saves `text` as a file the person names; the path, or null when cancelled. */
  vocabExport(format: "json" | "txt" | "csv", text: string): Promise<string | null>;
  /** Runs the last recording that failed to transcribe once more. */
  retry(): Promise<void>;
  /** Opens the operating system's sound input settings. */
  openSoundSettings(): Promise<void>;
  onStatus(cb: (s: DictationStatus) => void): () => void;
  /** HUD page and microphone window. */
  onHud(cb: (v: HudView) => void): () => void;
  hudAction(a: HudAction): void;
  recorder: {
    onCommand(cb: (c: RecorderCommand) => void): () => void;
    reply(id: number, result: RecorderResult): void;
    level(n: number): void;
    ready(): void;
  };
}

export type RecorderCommand = { id: number; op: "start"; prerollMs: number } | { id: number; op: "stop" } | { id: number; op: "discard" } | { id: number; op: "close" };
export type RecorderResult =
  | { ok: true; pcm?: Float32Array | undefined; sampleRate?: number | undefined; peak?: number | undefined; interrupted?: boolean | undefined }
  | { ok: false; code: "mic-denied" | "mic-missing" | "mic-busy" | "mic-failed" };

const text = v.pipe(v.string(), v.maxLength(200));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
export const DICTATION_ARGS = {
  status: v.tuple([]),
  setEnabled: v.tuple([v.boolean()]),
  patchSettings: v.tuple([DictationPatchSchema]),
  downloadModel: v.tuple([v.picklist(DICTATION_MODELS)]),
  cancelDownload: v.tuple([]),
  historyList: v.tuple([v.optional(text)]),
  historyCopy: v.tuple([id]),
  historyRemove: v.tuple([id]),
  historyClear: v.tuple([]),
  retry: v.tuple([]),
  openSoundSettings: v.tuple([]),
  historyStats: v.tuple([]),
  historyRecent: v.tuple([v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50))]),
  historyUseVersion: v.tuple([id, id]),
  historyRetranscribe: v.tuple([id, v.picklist(DICTATION_MODELS)]),
  historyCancelRetranscribe: v.tuple([]),
  historyAudio: v.tuple([id]),
  historyDeleteRecording: v.tuple([id]),
  historyExport: v.tuple([]),
  historyDismissNotice: v.tuple([]),
  vocabImport: v.tuple([]),
  vocabExport: v.tuple([v.picklist(["json", "txt", "csv"]), v.pipe(v.string(), v.maxLength(2_000_000))]),
} as const satisfies Record<DictationMethod, v.GenericSchema<unknown[]>>;

export const HudActionSchema = v.picklist(HUD_ACTIONS);
export const RecorderReplySchema = v.tuple([
  v.pipe(v.number(), v.integer()),
  v.variant("ok", [
    v.object({
      ok: v.literal(true),
      pcm: v.optional(v.instance(Float32Array)),
      sampleRate: v.optional(v.number()),
      peak: v.optional(v.number()),
      interrupted: v.optional(v.boolean()),
    }),
    v.object({ ok: v.literal(false), code: v.picklist(["mic-denied", "mic-missing", "mic-busy", "mic-failed"]) }),
  ]),
]);
