import { plural, type Health } from "@speakkit/protocol";
import { trayState as engineTrayState, trayTooltip, type TrayState } from "./engine-view";
import type { ReaderState } from "./reader";
import type { Bindings } from "./shortcuts";
import type { UpdateState } from "./updates";

/** Everything the tray icon, tooltip and menu depend on. */
export interface TrayContext {
  health: Health | null;
  serverError: string | null;
  reader: ReaderState;
  update: UpdateState;
  exportsRunning: number;
  doNotDisturb: boolean;
  shortcuts: Bindings;
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

export type TrayAction = "read-clipboard" | "open" | "pause" | "resume" | "stop" | "wake" | "restart-engine" | "dnd" | "settings" | "check-updates" | "restart-update" | "quit";

type TrayItem = { type: "separator" } | { type: "item"; action: TrayAction; label: string; enabled: boolean; checked?: boolean; hint?: string };

/** The short native menu (right click). One row changes with the engine and update state; reading rows appear while reading. */
export function trayMenuModel(c: TrayContext): TrayItem[] {
  const engine = c.health?.engine.state;
  const busy = engine === "loading" || engine === "downloading" || engine === "missing" || engine === "error" || !c.health;
  const item = (action: TrayAction, label: string, extra: Partial<Extract<TrayItem, { type: "item" }>> = {}): TrayItem => ({ type: "item", action, label, enabled: true, ...extra });
  const sep: TrayItem = { type: "separator" };
  const reading = c.reader.status === "playing" || c.reader.status === "preparing";
  const paused = c.reader.status === "paused";
  const rows: TrayItem[] = [item("read-clipboard", "Read clipboard", { enabled: !busy, hint: c.shortcuts["read-clipboard"] }), sep, item("open", "Open Speak Kit")];
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
