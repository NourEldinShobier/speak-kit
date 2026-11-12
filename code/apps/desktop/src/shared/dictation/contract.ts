import * as v from "valibot";
import type { HistoryStats, MicStatus } from "@speakkit/dictation";
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
  /** The state of the microphone the Audio card shows. */
  mic: MicStatus;
  /** Microphones the system lists, for the picker; empty until the list was asked for. */
  devices: MicDeviceView[];
}

export interface HistoryItem {
  id: string;
  at: number;
  text: string;
  /** Executable name of the program the text went to. */
  app?: string;
  /** Friendly name of that program. */
  appName?: string;
  durationMs?: number;
  /** "interrupted": the recording was cut short; "restored": brought back after a cancel. */
  kind?: "interrupted" | "restored";
  outcome?: "sent" | "copied" | "failed";
}

/** What the HUD page draws. */
export type HudView =
  | { kind: "ready"; hotkey: string }
  | { kind: "recording"; locked: boolean; startedAt: number; level: number; hotkey: string }
  | { kind: "transcribing" }
  | { kind: "pasted" }
  | { kind: "copied"; reason: "clipboard" | "elevated" }
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
    event(e: RecorderEvent): void;
  };
}

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
  historyRemoveMany: v.tuple([v.pipe(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))), v.maxLength(500))]),
  historyStats: v.tuple([]),
  micDevices: v.tuple([]),
  micMeter: v.tuple([v.boolean()]),
  retry: v.tuple([]),
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
