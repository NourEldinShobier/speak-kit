import { plural, type Health } from "@speakkit/protocol";
import { trayState as engineTrayState, trayTooltip, type TrayState } from "./engine-view";
import type { DesktopError } from "./errors";
import type { ReaderState } from "./reader";
import { hotkeyText } from "./dictation/keys";
import type { Bindings } from "./shortcuts";
import type { UpdateState } from "./updates";

/** Everything the tray icon, tooltip and menu depend on. */
export interface TrayContext {
  health: Health | null;
  serverError: DesktopError | null;
  reader: ReaderState;
  update: UpdateState;
  exportsRunning: number;
  doNotDisturb: boolean;
  shortcuts: Bindings;
  /** Absent where dictation cannot run (no key hook on this platform yet). */
  dictation?: { enabled: boolean; hotkey: string; /** The last dictations, newest first. */ recent?: string[] };
}

/** Icon variant: error beats paused beats "needs you" (update ready) beats working (download, load, reading, export) beats the engine's own state. */
export function trayIconState(c: TrayContext): TrayState {
  const engine = engineTrayState(c.health, c.serverError);
  if (engine === "error") return "error";
  if (c.reader.status === "paused") return "paused";
  if (c.update.kind === "ready") return "attention";
  if (c.reader.status === "playing" || c.reader.status === "preparing" || c.exportsRunning > 0) return "working";
  return engine;
}

export function trayTooltipFor(c: TrayContext): string {
  const r = c.reader;
  if (r.status === "playing" || r.status === "preparing") return `Speak Kit - Reading ${r.index + 1} of ${r.total}: ${r.title}`;
  if (r.status === "paused") return `Speak Kit - Paused: ${r.title}`;
  if (c.exportsRunning) return `Speak Kit - Exporting ${plural(c.exportsRunning, "file", "files")}`;
  if (c.update.kind === "ready") return `Speak Kit - Update ${c.update.version} ready`;
  return trayTooltip(c.health, c.serverError);
}

export type TrayAction =
  | "dictation"
  | "dictation-history"
  | "dictation-settings"
  | "dictation-copy-0"
  | "dictation-copy-1"
  | "dictation-copy-2"
  | "dictation-copy-3"
  | "dictation-copy-4"
  | "open"
  | "pause"
  | "resume"
  | "stop"
  | "wake"
  | "restart-engine"
  | "dnd"
  | "settings"
  | "check-updates"
  | "restart-update"
  | "quit";

export type TrayItem =
  | { type: "separator" }
  | { type: "submenu"; label: string; items: TrayItem[] }
  | { type: "item"; action: TrayAction; label: string; enabled: boolean; checked?: boolean; hint?: string };

export const RECENT_ROWS = 5;
const RECENT_CHARS = 48;

/** One line of a dictation for a menu row: whitespace folded, cut with an ellipsis. */
export const recentLabel = (text: string): string => {
  const one = text.replaceAll(/\s+/g, " ").trim();
  return one.length > RECENT_CHARS ? `${one.slice(0, RECENT_CHARS - 1)}…` : one;
};

/** The short native menu (right click). One row changes with the engine and update state; reading rows appear while reading. */
export function trayMenuModel(c: TrayContext): TrayItem[] {
  const engine = c.health?.engine.state;
  const item = (action: TrayAction, label: string, extra: Partial<Extract<TrayItem, { type: "item" }>> = {}): TrayItem => ({ type: "item", action, label, enabled: true, ...extra });
  const sep: TrayItem = { type: "separator" };
  const reading = c.reader.status === "playing" || c.reader.status === "preparing";
  const paused = c.reader.status === "paused";
  const rows: TrayItem[] = [item("open", "Open Speak Kit")];
  if (c.dictation) {
    const d = c.dictation;
    rows.push(item("dictation", "Dictation", { checked: d.enabled }));
    // A caption, not a command: disabled and without an action of its own.
    if (d.enabled) rows.push(item("dictation-settings", `Hold ${hotkeyText(d.hotkey)} to dictate`, { enabled: false }));
    if (d.recent?.length)
      rows.push({ type: "submenu", label: "Copy recent dictation", items: d.recent.slice(0, RECENT_ROWS).map((t, i) => item(`dictation-copy-${i}` as TrayAction, recentLabel(t))) });
    rows.push(item("dictation-history", "Dictation history"), item("dictation-settings", "Dictation settings"));
  }
  if (reading) rows.push(item("pause", "Pause", { hint: c.shortcuts["play-pause"] }), item("stop", "Stop", { hint: c.shortcuts.stop }));
  else if (paused) rows.push(item("resume", "Resume", { hint: c.shortcuts["play-pause"] }), item("stop", "Stop", { hint: c.shortcuts.stop }));
  if (engine === "unloaded") rows.push(item("wake", "Load the voice engine now"));
  else if (engine === "error") rows.push(item("restart-engine", "Restart the voice engine"));
  rows.push(sep, item("dnd", "Do not disturb", { checked: c.doNotDisturb }), item("settings", "Settings"));
  if (c.update.kind === "ready") rows.push(item("restart-update", `Restart to update to ${c.update.version}`));
  else rows.push(item("check-updates", c.update.kind === "checking" ? "Checking for updates..." : "Check for updates", { enabled: c.update.kind !== "checking" && c.update.kind !== "unsupported" }));
  rows.push(sep, item("quit", "Quit Speak Kit"));
  return rows;
}
