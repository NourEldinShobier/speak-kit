import type { Health } from "@speakkit/protocol";
import type { DesktopError } from "./errors";
import { at } from "./i18n";
import "./i18n/packs/main";

export type PillTone = "green" | "blue" | "orange" | "red" | "neutral";
/** normal (ready), working (download, load, reading, export), asleep (unloaded), error, paused (reading paused), attention (an update waits for you). */
export type TrayState = "normal" | "working" | "asleep" | "error" | "paused" | "attention";

interface EngineView {
  key: "starting" | "missing" | "downloading" | "unloaded" | "loading" | "ready" | "error";
  /** Short label for the status pill and lists. */
  label: string;
  /** Second half of the pill text, when there is one. */
  hint?: string;
  tone: PillTone;
  spinner: boolean;
}

/** One place that turns server health into words, used by the title bar pill, Home, Engines, Memory and the tray tooltip. */
export function engineView(health: Health | null, serverError: DesktopError | null): EngineView {
  if (!health) return serverError ? { key: "error", label: at("engine.error"), tone: "red", spinner: false } : { key: "starting", label: at("engine.starting"), tone: "neutral", spinner: true };
  const e = health.engine;
  switch (e.state) {
    case "missing":
      return { key: "missing", label: at("engine.missing"), tone: "orange", spinner: false };
    case "downloading":
      return {
        key: "downloading",
        label: at("engine.downloading", { pct: Math.round((e.progress ?? 0) * 100) }),
        tone: "blue",
        spinner: true,
      };
    case "unloaded":
      return { key: "unloaded", label: at("engine.unloaded"), hint: at("engine.unloadedHint"), tone: "neutral", spinner: false };
    case "loading":
      return { key: "loading", label: at("engine.loading"), tone: "blue", spinner: true };
    case "ready":
      return { key: "ready", label: at("engine.ready"), tone: "green", spinner: false };
    case "error":
      return { key: "error", label: at("engine.error"), tone: "red", spinner: false };
  }
}

/** Tray icon variant: normal (ready), working (download or load), asleep (unloaded or not downloaded), error. */
/** Tray variant from the engine alone; shared/tray.ts adds reading, exports and updates. */
export function trayState(health: Health | null, serverError: DesktopError | null): TrayState {
  if (serverError) return "error";
  switch (health?.engine.state) {
    case "error":
      return "error";
    case "downloading":
    case "loading":
      return "working";
    case "unloaded":
    case "missing":
      return "asleep";
    case "ready":
      return "normal";
    default:
      return "working";
  }
}

export function trayTooltip(health: Health | null, serverError: DesktopError | null): string {
  const v = engineView(health, serverError);
  return v.hint ? at("tray.tipEngineHint", { label: v.label, hint: at("engine.unloadedTip") }) : at("tray.tipEngine", { label: v.label });
}

/** The line under the engine name on Home: download progress, the idle explanation, or what the engine reports. */
export function engineDetail(engine: Health["engine"] | undefined): string {
  if (engine?.state === "downloading") return at("engine.detailDownloading", { pct: Math.round((engine.progress ?? 0) * 100) });
  if (engine?.state === "unloaded") return at("engine.detailUnloaded");
  return engine?.detail ?? at("engine.detailDefault");
}

/** The class of the status dot next to a pill tone on Home: green has none. */
export const DOT_CLASS: Record<PillTone, string> = { green: "", red: "is-err", neutral: "is-idle", blue: "is-warn", orange: "is-warn" };
