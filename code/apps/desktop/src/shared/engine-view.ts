import type { Health } from "@speakkit/protocol";

export type PillTone = "green" | "blue" | "orange" | "red" | "neutral";
/** normal (ready), working (download, load, reading, export), asleep (unloaded), error, paused (reading paused), attention (an update waits for you). */
export type TrayState = "normal" | "working" | "asleep" | "error" | "paused" | "attention";

export interface EngineView {
  key: "starting" | "missing" | "downloading" | "unloaded" | "loading" | "ready" | "error";
  /** Short label for the status pill and lists. */
  label: string;
  /** Second half of the pill text, when there is one. */
  hint?: string;
  tone: PillTone;
  spinner: boolean;
}

/** One place that turns server health into words, used by the title bar pill, Home, Engines, Memory and the tray tooltip. */
export function engineView(health: Health | null, serverError: string | null): EngineView {
  if (!health)
    return serverError
      ? { key: "error", label: "Error", tone: "red", spinner: false }
      : { key: "starting", label: "Starting", tone: "neutral", spinner: true };
  const e = health.engine;
  switch (e.state) {
    case "missing":
      return { key: "missing", label: "Not downloaded", tone: "orange", spinner: false };
    case "installing":
      return { key: "downloading", label: "Installing", tone: "blue", spinner: true };
    case "unavailable":
      return { key: "error", label: "Unavailable", tone: "orange", spinner: false };
    case "downloading":
      return {
        key: "downloading",
        label: `Download ${Math.round((e.progress ?? 0) * 100)}%`,
        tone: "blue",
        spinner: true,
      };
    case "unloaded":
      return { key: "unloaded", label: "Unloaded", hint: "Wakes on play", tone: "neutral", spinner: false };
    case "loading":
      return { key: "loading", label: "Loading", tone: "blue", spinner: true };
    case "ready":
      return { key: "ready", label: "Ready", tone: "green", spinner: false };
    case "error":
      return { key: "error", label: "Error", tone: "red", spinner: false };
  }
}

/** Tray icon variant: normal (ready), working (download or load), asleep (unloaded or not downloaded), error. */
/** Tray variant from the engine alone; shared/tray.ts adds reading, exports and updates. */
export function trayState(health: Health | null, serverError: string | null): TrayState {
  if (serverError) return "error";
  switch (health?.engine.state) {
    case "error":
      return "error";
    case "downloading":
    case "installing":
    case "loading":
      return "working";
    case "unloaded":
    case "missing":
    case "unavailable":
      return "asleep";
    case "ready":
      return "normal";
    default:
      return "working";
  }
}

export function trayTooltip(health: Health | null, serverError: string | null): string {
  const v = engineView(health, serverError);
  return `SpeakKit - ${v.label}${v.hint ? ` (${v.hint.toLowerCase()})` : ""}`;
}
