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
  dictation?: { enabled: boolean; hotkey: string };
  /** The downloaded speech models, for the quick switch. Absent when none is downloaded. */
  speechModels?: { models: { id: string; name: string; inUse: boolean }[]; switching?: { name: string }; recording: boolean };
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
  | "cancel-switch"
  | "get-models"
  | "quit";

/** A row of the Speech model submenu: a model to switch to, or a plain row. */
export type ModelRow = { type: "header"; label: string } | { type: "model"; id: string; label: string; checked: boolean; enabled: boolean } | { type: "action"; action: TrayAction; label: string };

type TrayItem = { type: "separator" } | { type: "item"; action: TrayAction; label: string; enabled: boolean; checked?: boolean; hint?: string } | { type: "models"; label: string; rows: ModelRow[] };

/** The Speech model submenu: downloaded models only, the one in use marked. While one is checked before switching the old one stays in use and the switch can be cancelled; during a recording the rows are greyed. */
export function speechModelRows(m: NonNullable<TrayContext["speechModels"]>): ModelRow[] {
  const rows: ModelRow[] = [];
  if (m.recording) rows.push({ type: "header", label: "Finish the recording first, then switch" });
  else if (m.switching) rows.push({ type: "header", label: `${m.switching.name} is checked before switching. The current model stays in use.` });
  const locked = m.recording || !!m.switching;
  for (const x of m.models) rows.push({ type: "model", id: x.id, label: x.name, checked: x.inUse, enabled: !locked });
  if (m.switching) rows.push({ type: "action", action: "cancel-switch", label: "Cancel the switch" });
  rows.push({ type: "action", action: "get-models", label: "Get more models in Engines" });
  return rows;
}

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
    rows.push(item("dictation-history", "Dictation history"), item("dictation-settings", "Dictation settings"));
  }
  if (c.dictation && c.speechModels && c.speechModels.models.length > 0) rows.push({ type: "models", label: "Speech model", rows: speechModelRows(c.speechModels) });
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
