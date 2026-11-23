import type { Health, VoiceList } from "@speakkit/protocol";
import type { DownloadsReport } from "./app-data";
import type { DesktopError } from "./errors";
import type { Config } from "./schemas";
import type { ExportOptions, ExportTarget, ExportView } from "./export";
import type { ReaderCommand, ReaderState } from "./reader";
import type { Bindings, ShortcutConflict, ShortcutId } from "./shortcuts";
import type { UpdateAction, UpdateState } from "./updates";
import type { MicAccess } from "./settings/permissions";
import type { SettingsNotice } from "./settings/settings-file";
import type { VoiceChatKeyStatus, VoiceChatSaveResult, VoiceChatTestResult } from "./voice-chat";

export type { Config, ConfigPatch } from "./schemas";

/** The answer to a change of settings made through the one validator. */
export type SettingsResult = { ok: true } | { ok: false; message: string; shortcut?: Extract<ShortcutResult, { ok: false }> };

export const PAGES = ["library", "voices", "voice-chat", "engines", "dictation", "modes", "vocabulary", "history", "settings"] as const;
export const SETTINGS_SUBS = ["general", "shortcuts", "accessibility", "storage", "privacy", "browser", "whatsnew", "about"] as const;
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
  /** Bad settings repaired at start, or a file from a newer app; shown as a banner in Settings until dismissed. */
  settingsNotice: SettingsNotice | null;
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
  /** Exports and OCR language data. */
  cacheBytes: number;
  logsBytes: number;
  otherBytes: number;
}

export type ShortcutResult = { ok: true } | { ok: false; error: DesktopError; conflict?: ShortcutConflict };

export type ExternalLink = "webstore" | "release-notes" | "issues" | "security";
export type OpenPath = "models" | "logs" | "data";

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
  /** A change of settings from a Settings page: checked by the settings registry. Keys are `voice`, `speed`... or `dictation.<key>`. */
  applySettings(change: Record<string, unknown>): Promise<SettingsResult>;
  setLaunchAtLogin(on: boolean): Promise<AppState>;
  retryEngine(): Promise<AppState>;
  /** Starts the model download (and load) when it is not on disk yet. Idempotent. */
  downloadModel(): Promise<AppState>;
  voices(): Promise<VoiceList>;
  preview(voice: string, text: string, speed?: number): Promise<PreviewAudio>;
  copy(text: string): Promise<void>;
  openExternal(link: ExternalLink): Promise<void>;
  openPath(which: OpenPath): Promise<void>;
  storage(): Promise<StorageInfo>;
  /** Stops the engine and deletes the downloaded model, OCR data and exports. The library and settings stay. */
  deleteDownloads(): Promise<DownloadsReport>;
  hideWindow(): Promise<void>;
  /** Really quits (after the renderer's confirmation dialog). */
  quit(): Promise<void>;
  setShortcut(id: ShortcutId, accelerator: string): Promise<ShortcutResult>;
  /** Controls the current reading (mini player, palette). */
  reader(cmd: ReaderCommand): Promise<void>;
  /** The mini player reports what its audio output is doing. */
  readerStarted(epoch: number, index: number): Promise<void>;
  readerDone(epoch: number, index: number): Promise<void>;
  updateAction(action: UpdateAction): Promise<AppState>;
  exportCheck(dir: string, name: string, format: "wav" | "mp3"): Promise<ExportTarget>;
  exportStart(options: ExportOptions): Promise<ExportView>;
  exportCancel(id: string): Promise<void>;
  /** Opens the folder of a finished export, or the file itself. Only paths of exports from this session are accepted. */
  exportReveal(path: string, open: boolean): Promise<void>;
  pickFolder(current: string): Promise<string | null>;
  /** Reveals the bundled extension folder and opens the browser extensions page. Returns the folder, or null when not packaged. */
  installExtension(): Promise<string | null>;
  /** Voice chat key: only whether one is saved. The key itself never comes back to the renderer. */
  voiceChatStatus(): Promise<VoiceChatKeyStatus>;
  /** Encrypts the key with the operating system and stores it; refused when the computer cannot encrypt. */
  voiceChatSetKey(key: string): Promise<VoiceChatSaveResult>;
  voiceChatRemoveKey(): Promise<VoiceChatKeyStatus>;
  /** Asks OpenAI whether the saved key is accepted. */
  voiceChatTestKey(): Promise<VoiceChatTestResult>;
  /** The log lines since the last read; `lines` is null when the file did not grow, so the view stays as it is. */
  diagnosticsLog(sinceSize: number): Promise<{ size: number; lines: string[] | null }>;
  dismissSettingsNotice(): Promise<AppState>;
  micAccess(): Promise<MicAccess>;
  /** Opens the operating system page where the microphone permission is changed; false when this system has none. */
  openSystemSettings(which: "microphone"): Promise<boolean>;
  onState(cb: (s: AppState) => void): () => void;
  onUi(cb: (e: UiEvent) => void): () => void;
}

export const METHODS = [
  "state",
  "applySettings",
  "setLaunchAtLogin",
  "retryEngine",
  "downloadModel",
  "voices",
  "preview",
  "copy",
  "openExternal",
  "openPath",
  "storage",
  "deleteDownloads",
  "hideWindow",
  "quit",
  "setShortcut",
  "reader",
  "readerStarted",
  "readerDone",
  "updateAction",
  "exportCheck",
  "exportStart",
  "exportCancel",
  "exportReveal",
  "pickFolder",
  "installExtension",
  "voiceChatStatus",
  "voiceChatSetKey",
  "voiceChatRemoveKey",
  "voiceChatTestKey",
  "diagnosticsLog",
  "dismissSettingsNotice",
  "micAccess",
  "openSystemSettings",
] as const;
export type Method = (typeof METHODS)[number];
export const STATE_EVENT = "speakkit:state";
export const UI_EVENT = "speakkit:ui";
export const channel = (m: string) => `speakkit:${m}`;
