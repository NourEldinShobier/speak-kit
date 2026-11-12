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
  /** This system has a mouse hook, so a mouse button can be a shortcut. */
  mouseButtons: boolean;
  /** `process.platform` of the app, for the options that exist on Windows only. */
  platform: string;
  /** Pause all shortcuts is on: keys pass through. Not saved; a restart starts unpaused. */
  paused: boolean;
  /** The reader's global shortcuts, so a recorder can warn about a clash before saving. */
  readerShortcuts: Record<string, string>;
  /** The last change was refused because the shortcut is already used. */
  rejected?: { slot: import("./conflicts").Slot; with: import("./conflicts").Slot };
  /** The feature that holds the microphone now, when one does. */
  micOwner?: string;
  /** Who held the microphone when the last dictation press was ignored. */
  errorOwner?: string;
}

export interface HistoryItem {
  id: string;
  at: number;
  text: string;
  app?: string;
  /** "raw": dictated with clean-up off. "printed": handed to a command, never pasted. */
  kind?: "raw" | "printed";
}

/** What the HUD page draws. */
export type HudView =
  | { kind: "ready"; hotkey: string }
  | { kind: "recording"; locked: boolean; startedAt: number; level: number; hotkey: string; /** Name of the key that cancels this recording, when one does. */ cancel?: string }
  | { kind: "transcribing" }
  | { kind: "pasted" }
  | { kind: "copied"; reason: "clipboard" | "elevated" | "secure-input" }
  | { kind: "notice"; text: string; action?: { label: string; id: HudAction } }
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
  /** Pause all shortcuts (true) or resume them. The returned status shows the state once keys are released. */
  setPaused(on: boolean): Promise<DictationStatus>;
  /** Types the last dictation into the window in front. */
  pasteLast(): Promise<"pasted" | "copied" | "empty" | "failed">;
  /** Brings back the recording cancelled in the last minute. */
  undoCancel(): Promise<boolean>;
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
  setPaused: v.tuple([v.boolean()]),
  pasteLast: v.tuple([]),
  undoCancel: v.tuple([]),
  openSoundSettings: v.tuple([]),
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
