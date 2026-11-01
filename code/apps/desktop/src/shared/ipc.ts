import type { Health, VoiceList } from "@speakkit/protocol";
import type { Config, ConfigPatch } from "./schemas";

export type { Config, ConfigPatch } from "./schemas";
export const PAGES = ["home", "voices", "engines", "browser", "settings"] as const;
export const SETTINGS_SUBS = ["general", "voice", "memory", "browser", "storage", "about"] as const;
export type Page = (typeof PAGES)[number];
export type SettingsSub = (typeof SETTINGS_SUBS)[number];

/** One line in the bell: something that happened while the user may not have been looking. */
export interface Activity {
  id: number;
  atMs: number;
  kind: "download" | "error" | "pair" | "info";
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
  serverError: string | null;
  config: Config;
  launchAtLogin: boolean;
  onBattery: boolean;
  pairing: Pairing;
  activity: Activity[];
}

export interface PreviewAudio {
  sampleRate: number;
  chunks: Int16Array[];
}

export interface StorageInfo {
  modelsDir: string;
  logsDir: string;
  modelsBytes: number;
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

export type ExternalLink = "webstore";
export type OpenPath = "models" | "logs";

/** Main to renderer, besides the state stream. */
export type UiEvent =
  | { type: "nav"; page: Page; sub?: SettingsSub }
  | { type: "confirm-quit" }
  | { type: "pause" };

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
  metrics(): Promise<Metrics>;
  hideWindow(): Promise<void>;
  /** Really quits (after the renderer's confirmation dialog). */
  quit(): Promise<void>;
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
  "metrics",
  "hideWindow",
  "quit",
] as const;
export type Method = (typeof METHODS)[number];
export const STATE_EVENT = "speakkit:state";
export const UI_EVENT = "speakkit:ui";
export const channel = (m: string) => `speakkit:${m}`;
