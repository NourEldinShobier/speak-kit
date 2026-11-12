import * as v from "valibot";
import type { DictationConfig, DictationModelId } from "./settings";
import { DICTATION_MODELS, DictationPatchSchema } from "./settings";
import { HUD_ACTIONS, type DictationMethod, type HudAction } from "./channels";

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
  progress?: { kind: "downloading"; fraction: number; etaSeconds?: number } | { kind: "preparing" } | { kind: "paused"; fraction: number };
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
}

export interface HistoryItem {
  id: string;
  at: number;
  text: string;
  app?: string;
  /** Name of the speech model that heard it, and the language it was told (a label); absent for entries from before these were stored. */
  model?: string;
  language?: string;
}

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
  /** Runs the last recording that failed to transcribe once more. */
  retry(): Promise<void>;
  /** Opens the operating system's sound input settings. */
  openSoundSettings(): Promise<void>;
  /** Opens the operating system's microphone permission page. */
  openMicrophoneSettings(): Promise<void>;
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
export const DICTATION_ARGS = {
  status: v.tuple([]),
  setEnabled: v.tuple([v.boolean()]),
  patchSettings: v.tuple([DictationPatchSchema]),
  downloadModel: v.tuple([v.picklist(DICTATION_MODELS)]),
  cancelDownload: v.tuple([]),
  historyList: v.tuple([v.optional(text)]),
  historyCopy: v.tuple([v.pipe(v.string(), v.minLength(1), v.maxLength(64))]),
  historyRemove: v.tuple([v.pipe(v.string(), v.minLength(1), v.maxLength(64))]),
  historyClear: v.tuple([]),
  retry: v.tuple([]),
  openSoundSettings: v.tuple([]),
  openMicrophoneSettings: v.tuple([]),
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
