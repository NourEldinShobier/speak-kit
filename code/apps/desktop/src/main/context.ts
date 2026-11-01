import type { Activity, AppState, UiEvent } from "../shared/ipc";
import type { Config } from "../shared/schemas";
import type { ServerApi } from "./server-api";

export interface Logger {
  info(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

/** What the desktop features (reading, exports, updates, tray) share with the main process. */
export interface Ctx {
  state: AppState;
  config: Config;
  saveConfig(): void;
  /** Sends the state to every open window and returns it. */
  publish(): AppState;
  /** Extra windows (mini player, tray panel) register here to get every published state. */
  sinks: Set<(state: AppState) => void>;
  /** Brings the main window forward. */
  showWindow(): void;
  /** Event for the main window only. */
  sendUi(e: UiEvent): void;
  addActivity(kind: Activity["kind"], title: string, body: string): void;
  server: ServerApi;
  log: Logger;
  /** True while the main window is visible and focused. */
  looking(): boolean;
}
