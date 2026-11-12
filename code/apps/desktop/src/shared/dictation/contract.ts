import type { Note } from "./sounds";
import * as v from "valibot";
import type { HistoryStats, InstalledApp, MicStatus } from "@speakkit/dictation";
import type { DictationConfig, DictationModelId } from "./settings";
import { DICTATION_LANGUAGES, DICTATION_MODELS, DictationPatchSchema, modelId } from "./settings";
import { HUD_ACTIONS, type DictationMethod, type HudAction } from "./channels";
import type { RewriteOutcome } from "@speakkit/dictation";

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
  /** The state of the microphone the Audio card shows. */
  mic: MicStatus;
  /** Microphones the system lists, for the picker; empty until the list was asked for. */
  devices: MicDeviceView[];
  /** "newer": history.json was written by a newer Speak Kit; it is left unchanged, a copy was made, and nothing is saved this session. "unreadable": it was not a history; a copy was made and the history starts empty. */
  historyStatus: "ok" | "newer" | "unreadable";
  /** The file name of the copy kept for a newer or unreadable history file. */
  historyCopy?: string;
  /** Changes whenever an entry changes without the count changing (a version added or chosen, a recording removed), so the History page reloads. */
  historyRev: number;
  /** Recordings the Recycle Bin would not take: they are still on disk. */
  keptRecordings: number;
  /** An OpenAI key is saved, so the rewrite pass can run. */
  rewriteKey: boolean;
  /** The speech model in use cannot read the word list, so it was left out of the last dictation; the words still work through replacements. */
  promptDropped?: boolean;
  /** The newest failure, kept until a dictation works again or the person dismisses it: what it was in plain words, when, and whether Try again can run the take again. */
  lastFailure?: { code: string; text: string; at: number; retry: boolean };
  /** "Transcribe again" for one entry, while it runs or after it failed; absent otherwise. */
  redo?: { id: string; model: DictationModelId; state: "running" | "failed"; error?: "model-missing" | "failed" | "no-audio" | "busy" };
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
  /** Executable name of the program the text went to. */
  app?: string;
  /** Friendly name of that program. */
  appName?: string;
  /** "raw": dictated with clean-up off. "printed": handed to a command, never pasted. "interrupted": the recording was cut short. */
  kind?: "raw" | "printed" | "interrupted" | "restored";
  outcome?: "sent" | "copied" | "failed";
  /** What the speech model heard, before the clean-up. */
  raw: string;
  model?: string;
  durationMs: number;
  rewrite?: RewriteOutcome;
  /** Milliseconds until the entry is removed; null when it is kept for ever. */
  expiresInMs: number | null;
  /** How long the speech model took, and how much silence was cut before it ran. */
  timings?: { transcribeMs?: number; insertMs?: number; pausesDroppedMs?: number };
  /** The entry has a kept recording. */
  recording?: boolean;
  recordingRemoved?: boolean;
  versions?: HistoryVersion[];
  /** The version in use. */
  version?: string;
  /** The search matched this vocabulary word through one of its sounds-like spellings. */
  via?: { word: string; heard: string };
  /** Name of the speech model that heard it, and the language it was told (a label); absent for entries from before these were stored. */
  language?: string;
}

export type { HistoryStats };

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
  historyRemoveMany(ids: string[]): Promise<void>;
  historyStats(): Promise<HistoryStats>;
  /** Asks the microphone window to list the inputs; the answer arrives in the status. */
  micDevices(): Promise<DictationStatus>;
  /** Starts or stops the level meter of the Audio card; the microphone is open only while it is on. */
  micMeter(on: boolean): Promise<void>;
  onMicLevel(cb: (n: number) => void): () => void;
  /** The last `n` entries, newest first. */
  historyRecent(n: number): Promise<HistoryItem[]>;
  historyUseVersion(id: string, versionId: string): Promise<boolean>;
  /** Transcribes the kept recording again with `model` and, for this run only, `language` (the dictation language when absent); progress and failure arrive in the status (`redo`). */
  historyRetranscribe(id: string, model: DictationModelId, language?: DictationConfig["language"]): Promise<void>;
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
  /** The programs installed on this computer, found the first time it is asked; `refresh` scans again. */
  installedApps(refresh?: boolean): Promise<{ apps: InstalledApp[]; available: boolean }>;
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
    /** Samples of the running recording, in order. */
    chunk(pcm: Float32Array): void;
    ready(): void;
    event(e: RecorderEvent): void;
  };
}

/** The microphone window records mono at this rate. */
export const RECORDER_RATE = 16_000;

export interface RecorderMicConfig {
  /** Chosen device id; empty for automatic. */
  saved: string;
  exclusions: string[];
  avoidBluetooth: boolean;
  /** How long an idle open microphone stays open: 0 closes it at once, -1 keeps it open. */
  keepMs: number;
}

export interface MicDeviceView {
  id: string;
  label: string;
}

export type RecorderEvent =
  | { type: "devices"; devices: MicDeviceView[] }
  | { type: "silent" | "lost" | "gave-up" }
  | { type: "reopening"; attempt: number }
  | { type: "opened"; label: string; bluetooth: boolean }
  | { type: "no-device"; builtInOff: boolean };

export type RecorderCommand =
  | { id: number; op: "start"; prerollMs: number; mic: RecorderMicConfig }
  | { id: number; op: "stop" }
  | { id: number; op: "discard" }
  | { id: number; op: "close" }
  | { id: number; op: "devices" }
  /** Plays a short tone on the speakers; the notes come from `tonesFor`. */
  | { id: number; op: "tone"; notes: Note[] }
  /** Applies the microphone settings at once: opens the microphone when it is to be kept ready or the level meter is on, lets it go otherwise. */
  | { id: number; op: "configure"; meter: boolean; mic: RecorderMicConfig };
export type RecorderResult =
  | {
      ok: true;
      pcm?: Float32Array | undefined;
      sampleRate?: number | undefined;
      peak?: number | undefined;
      interrupted?: boolean | undefined;
      device?: { label: string; bluetooth: boolean } | undefined;
    }
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
  historyRemoveMany: v.tuple([v.pipe(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))), v.maxLength(500))]),
  historyStats: v.tuple([]),
  micDevices: v.tuple([]),
  micMeter: v.tuple([v.boolean()]),
  retry: v.tuple([]),
  setPaused: v.tuple([v.boolean()]),
  pasteLast: v.tuple([]),
  undoCancel: v.tuple([]),
  openSoundSettings: v.tuple([]),
  historyRecent: v.tuple([v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50))]),
  historyUseVersion: v.tuple([id, id]),
  historyRetranscribe: v.tuple([id, modelId, v.optional(v.picklist(DICTATION_LANGUAGES))]),
  historyCancelRetranscribe: v.tuple([]),
  historyAudio: v.tuple([id]),
  historyDeleteRecording: v.tuple([id]),
  historyExport: v.tuple([]),
  historyDismissNotice: v.tuple([]),
  vocabImport: v.tuple([]),
  vocabExport: v.tuple([v.picklist(["json", "txt", "csv"]), v.pipe(v.string(), v.maxLength(2_000_000))]),
  openMicrophoneSettings: v.tuple([]),
  installedApps: v.tuple([v.optional(v.boolean())]),
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
      device: v.optional(v.object({ label: v.pipe(v.string(), v.maxLength(300)), bluetooth: v.boolean() })),
    }),
    v.object({ ok: v.literal(false), code: v.picklist(["mic-denied", "mic-missing", "mic-busy", "mic-failed"]) }),
  ]),
]);

export const RecorderEventSchema = v.variant("type", [
  v.object({ type: v.picklist(["silent", "lost", "gave-up"]) }),
  v.object({ type: v.literal("reopening"), attempt: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)) }),
  v.object({ type: v.literal("opened"), label: v.pipe(v.string(), v.maxLength(300)), bluetooth: v.boolean() }),
  v.object({ type: v.literal("no-device"), builtInOff: v.boolean() }),
  v.object({
    type: v.literal("devices"),
    devices: v.pipe(v.array(v.object({ id: v.pipe(v.string(), v.maxLength(300)), label: v.pipe(v.string(), v.maxLength(300)) })), v.maxLength(50)),
  }),
]);
