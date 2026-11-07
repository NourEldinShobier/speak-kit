import type { ClonedVoice, EngineId, EngineList, Health, UpdateVoiceRequest, VoiceList } from "@speakkit/protocol";
import type { DownloadsReport } from "./app-data";
import type { DesktopError } from "./errors";
import type { Config, ConfigPatch } from "./schemas";
import type { ExportOptions, ExportTarget, ExportView } from "./export";
import type { ReaderCommand, ReaderState } from "./reader";
import type { Bindings, ShortcutConflict, ShortcutId } from "./shortcuts";
import type { UpdateAction, UpdateState } from "./updates";

export type { Config, ConfigPatch } from "./schemas";
export const PAGES = ["home", "library", "voices", "engines", "browser", "settings"] as const;
export const SETTINGS_SUBS = ["general", "voice", "shortcuts", "notifications", "memory", "browser", "storage", "about"] as const;
export type Page = (typeof PAGES)[number];
export type SettingsSub = (typeof SETTINGS_SUBS)[number];

/** One line in the bell: something that happened while the user may not have been looking. */
export interface Activity {
  id: number;
  atMs: number;
  kind: "error" | "pair" | "info" | "export" | "update" | "reading";
  title: string;
  body: string;
}

/** Last authenticated call from a browser extension (seen by the server's request channel). */
export interface Pairing {
  firstSeenMs: number | null;
  lastSeenMs: number | null;
  origin: string | null;
}

export interface AppState {
  version: string;
  platform: string;
  /** Port the server really listens on (0 while starting or failed). */
  port: number;
  /** True when `port` is not the preferred port because that one was busy. */
  portFallback: boolean;
  token: string;
  health: Health | null;
  serverError: DesktopError | null;
  config: Config;
  launchAtLogin: boolean;
  onBattery: boolean;
  pairing: Pairing;
  activity: Activity[];
  reader: ReaderState;
  shortcuts: { bindings: Bindings; conflicts: Partial<Record<ShortcutId, ShortcutConflict>> };
  update: UpdateState;
  exports: ExportView[];
  /** Folder the export dialog starts in. */
  exportDir: string;
  /** False when running from source: no installer, no updates, no bundled extension. */
  packaged: boolean;
}

export interface PreviewAudio {
  sampleRate: number;
  chunks: Int16Array[];
}

export interface StorageInfo {
  modelsDir: string;
  logsDir: string;
  modelsBytes: number;
  /** Optional engines (Chatterbox). */
  enginesBytes: number;
  /** Exports and OCR language data. */
  cacheBytes: number;
  logsBytes: number;
  otherBytes: number;
}

export interface Metrics {
  /** Sum of working sets of every Electron process, MB. */
  totalMb: number;
  mainMb: number;
  rendererMb: number;
  otherMb: number;
}

export type ShortcutResult = { ok: true } | { ok: false; error: DesktopError; conflict?: ShortcutConflict };

export type ExternalLink = "webstore" | "microphone-settings";
export type OpenPath = "models" | "logs";

/** Main to renderer, besides the state stream. */
export type UiEvent =
  | { type: "nav"; page: Page; sub?: SettingsSub }
  | { type: "confirm-quit" }
  | { type: "pause" }
  | { type: "export"; text?: string }
  /** To the mini player, which owns the audio output. */
  | { type: "chunk"; epoch: number; index: number; audio: PreviewAudio }
  | { type: "player"; op: "pause" | "resume" | "flush" };

/** The only surface the renderer gets (window.speakkit). Every call is an ipcMain.handle on `speakkit:<name>`, validated with ARGS in schemas.ts. */
export interface Api {
  state(): Promise<AppState>;
  patchConfig(patch: ConfigPatch): Promise<AppState>;
  setLaunchAtLogin(on: boolean): Promise<AppState>;
  setPort(port: number): Promise<AppState>;
  regenerateToken(): Promise<AppState>;
  retryEngine(): Promise<AppState>;
  /** Starts the model download (and load) when it is not on disk yet. Idempotent. */
  downloadModel(): Promise<AppState>;
  voices(): Promise<VoiceList>;
  preview(voice: string, text: string, speed?: number): Promise<PreviewAudio>;
  copy(text: string): Promise<void>;
  openExternal(link: ExternalLink): Promise<void>;
  openPath(which: OpenPath): Promise<void>;
  storage(): Promise<StorageInfo>;
  /** Stops the engines and deletes the downloaded models, engines, OCR data and exports. The library, cloned voices and settings stay. */
  deleteDownloads(): Promise<DownloadsReport>;
  metrics(): Promise<Metrics>;
  hideWindow(): Promise<void>;
  /** Really quits (after the renderer's confirmation dialog). */
  quit(): Promise<void>;
  setShortcut(id: ShortcutId, accelerator: string): Promise<ShortcutResult>;
  resetShortcuts(): Promise<AppState>;
  /** Controls the current reading (mini player, palette). */
  reader(cmd: ReaderCommand): Promise<void>;
  /** The mini player reports what its audio output is doing. */
  readerStarted(epoch: number, index: number): Promise<void>;
  readerDone(epoch: number, index: number): Promise<void>;
  /** Loads the voice engine now (Memory: Load now). */
  warmEngine(): Promise<void>;
  engines(): Promise<EngineList>;
  selectEngine(id: EngineId): Promise<EngineList>;
  installEngine(id: EngineId): Promise<EngineList>;
  /** Stops a running install of an optional engine. */
  cancelInstall(id: EngineId): Promise<EngineList>;
  removeEngine(id: EngineId): Promise<EngineList>;
  updateAction(action: UpdateAction): Promise<AppState>;
  exportCheck(dir: string, name: string, format: "wav" | "mp3"): Promise<ExportTarget>;
  exportStart(options: ExportOptions): Promise<ExportView>;
  exportCancel(id: string): Promise<void>;
  /** Opens the folder of a finished export, or the file itself. Only paths of exports from this session are accepted. */
  exportReveal(path: string, open: boolean): Promise<void>;
  pickFolder(current: string): Promise<string | null>;
  /** Opens the file dialog for a reference clip (WAV, MP3, M4A or FLAC) and returns its bytes, or null when cancelled. */
  pickReference(): Promise<{ name: string; bytes: Uint8Array } | null>;
  /** Sends a 16-bit mono WAV to the server for cloning; `consent` is the person's confirmation that they may clone this voice. Rejects with a `clip-rejected` DesktopError (with the per-criterion checks) when the clip is not usable. */
  cloneVoice(req: { name: string; consent: true; audio: Uint8Array }): Promise<ClonedVoice>;
  clonedVoices(): Promise<ClonedVoice[]>;
  updateClonedVoice(id: string, patch: UpdateVoiceRequest): Promise<ClonedVoice>;
  deleteClonedVoice(id: string): Promise<void>;
  /** Reveals the bundled extension folder and opens the browser extensions page. Returns the folder, or null when not packaged. */
  installExtension(): Promise<string | null>;
  onState(cb: (s: AppState) => void): () => void;
  onUi(cb: (e: UiEvent) => void): () => void;
}

export const METHODS = [
  "state",
  "patchConfig",
  "setLaunchAtLogin",
  "setPort",
  "regenerateToken",
  "retryEngine",
  "downloadModel",
  "voices",
  "preview",
  "copy",
  "openExternal",
  "openPath",
  "storage",
  "deleteDownloads",
  "metrics",
  "hideWindow",
  "quit",
  "setShortcut",
  "resetShortcuts",
  "reader",
  "readerStarted",
  "readerDone",
  "warmEngine",
  "engines",
  "selectEngine",
  "installEngine",
  "cancelInstall",
  "removeEngine",
  "updateAction",
  "exportCheck",
  "exportStart",
  "exportCancel",
  "exportReveal",
  "pickFolder",
  "pickReference",
  "cloneVoice",
  "clonedVoices",
  "updateClonedVoice",
  "deleteClonedVoice",
  "installExtension",
] as const;
export type Method = (typeof METHODS)[number];
export const STATE_EVENT = "speakkit:state";
export const UI_EVENT = "speakkit:ui";
export const channel = (m: string) => `speakkit:${m}`;
