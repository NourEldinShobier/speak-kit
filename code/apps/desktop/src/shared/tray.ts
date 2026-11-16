import type { Health } from "@speakkit/protocol";
import { at } from "./i18n";
import "./i18n/packs/main";
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
  /** `process.platform`, for how keys are named in menu text. */
  platform?: string;
  /** One line about a problem that happened while the window was closed; the first row of the menu. */
  notice?: string;
  /** The system theme of the taskbar or menu bar is dark. */
  darkTaskbar?: boolean;
  /** Absent where dictation cannot run (no key hook on this platform yet). */
  dictation?: {
    enabled: boolean;
    hotkey: string;
    /** Pause all shortcuts is on. */ paused?: boolean;
    /** Key chord of Paste last, shown beside the row. */ pasteLast?: string;
    /** The last dictations, newest first. */ recent?: string[];
  };
  /** The manual recorder: ready, starting, recording, saving what was recorded, or its transcript being made. */
  recorder?: { phase: "ready" | "starting" | "recording" | "saving" | "transcribing" | "done" };
  /** The downloaded speech models, for the quick switch. Absent when none is downloaded. */
  speechModels?: { models: { id: string; name: string; inUse: boolean }[]; switching?: { name: string }; recording: boolean };
  /** Meeting recording; absent while the Meetings feature is off. `shortcut` is the optional start and stop shortcut. */
  meetings?: { phase: "ready" | "starting" | "recording" | "saving" | "transcribing"; shortcut?: string };
}

/** Icon variant: error beats paused beats "needs you" (update ready) beats working (download, load, reading, export) beats the engine's own state. */
export function trayIconState(c: TrayContext): TrayState {
  const engine = engineTrayState(c.health, c.serverError);
  if (engine === "error") return "error";
  if (c.reader.status === "paused" || c.dictation?.paused) return "paused";
  if (c.update.kind === "ready") return "attention";
  if (c.reader.status === "playing" || c.reader.status === "preparing" || c.exportsRunning > 0) return "working";
  return engine;
}

/** Windows draws a separate icon for a dark taskbar; the macOS menu bar tints a template image itself, so it has one variant. */
export const trayIconVariant = (c: TrayContext): "light" | "dark" => (c.platform === "win32" && c.darkTaskbar ? "dark" : "light");

export function trayTooltipFor(c: TrayContext): string {
  const r = c.reader;
  if (c.dictation?.paused) return at("tray.tipPaused");
  if (r.status === "playing" || r.status === "preparing") return at("tray.tipReading", { n: r.index + 1, total: r.total, title: r.title });
  if (r.status === "paused") return at("tray.tipReadingPaused", { title: r.title });
  if (c.exportsRunning) return at("tray.tipExporting", { n: c.exportsRunning });
  if (c.update.kind === "ready") return at("tray.tipUpdate", { version: c.update.version });
  return trayTooltip(c.health, c.serverError);
}

export type TrayAction =
  | "dictation"
  | "dictation-history"
  | "paste-last"
  | "pause-shortcuts"
  | "dictation-settings"
  | "record-start"
  | "record-stop"
  | "dictation-copy-0"
  | "dictation-copy-1"
  | "dictation-copy-2"
  | "dictation-copy-3"
  | "dictation-copy-4"
  | "meeting-start"
  | "meeting-stop"
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

export type TrayItem =
  | { type: "separator" }
  | { type: "submenu"; label: string; items: TrayItem[] }
  | { type: "models"; label: string; rows: ModelRow[] }
  | { type: "item"; action: TrayAction; label: string; enabled: boolean; checked?: boolean; hint?: string };

export const RECENT_ROWS = 5;
const RECENT_CHARS = 48;

/** One line of a dictation for a menu row: whitespace folded, cut with an ellipsis. */
export const recentLabel = (text: string): string => {
  const one = text.replaceAll(/\s+/g, " ").trim();
  return one.length > RECENT_CHARS ? `${one.slice(0, RECENT_CHARS - 1)}…` : one;
};

const WAITING = { starting: "tray.recordStarting", saving: "tray.recordSaving" } as const;

/** One row that follows the recorder: it starts a recording when ready, stops it while recording, and waits (disabled) while the recording is saved and transcribed. */
function recorderRow(phase: NonNullable<TrayContext["recorder"]>["phase"], item: (a: TrayAction, label: string, x?: Partial<Extract<TrayItem, { type: "item" }>>) => TrayItem): TrayItem {
  if (phase === "ready") return item("record-start", at("tray.record"));
  if (phase === "recording") return item("record-stop", at("tray.recordStop"));
  if (phase === "done") return item("record-start", at("tray.recordDone"));
  if (phase === "transcribing") return item("record-start", at("tray.record"));
  return item("record-start", at(WAITING[phase]), { enabled: false });
}

/** What a press of the record shortcut does: it stops a recording, starts one when idle, and does nothing only while a recording is starting or being saved (a transcript being made does not block a new recording). */
export function recordToggle(phase: NonNullable<TrayContext["recorder"]>["phase"]): "start" | "stop" | "none" {
  if (phase === "recording") return "stop";
  return phase === "starting" || phase === "saving" ? "none" : "start";
}

/** A row of the Speech model submenu: a model to switch to, or a plain row. */
export type ModelRow = { type: "header"; label: string } | { type: "model"; id: string; label: string; checked: boolean; enabled: boolean } | { type: "action"; action: TrayAction; label: string };

/** The Speech model submenu: downloaded models only, the one in use marked. While one is checked before switching the old one stays in use and the switch can be cancelled; during a recording the rows are greyed. */
export function speechModelRows(m: NonNullable<TrayContext["speechModels"]>): ModelRow[] {
  const rows: ModelRow[] = [];
  if (m.recording) rows.push({ type: "header", label: at("tray.finishFirst") });
  else if (m.switching) rows.push({ type: "header", label: at("tray.switching", { name: m.switching.name }) });
  const locked = m.recording || !!m.switching;
  for (const x of m.models) rows.push({ type: "model", id: x.id, label: x.name, checked: x.inUse, enabled: !locked });
  if (m.switching) rows.push({ type: "action", action: "cancel-switch", label: at("tray.cancelSwitch") });
  rows.push({ type: "action", action: "get-models", label: at("tray.getModels") });
  return rows;
}

/** The Speech model submenu, only where dictation runs and a model is downloaded. */
function speechModelItems(c: TrayContext): TrayItem[] {
  const m = c.speechModels;
  return c.dictation && m && m.models.length > 0 ? [{ type: "models", label: at("tray.models"), rows: speechModelRows(m) }] : [];
}

const MEETING_WAITING = { starting: "tray.meetingStarting", saving: "tray.meetingSaving", transcribing: "tray.meetingTranscribing" } as const;

/** One row that follows the meeting recording: starts one when ready, stops it while recording, and waits (disabled) while it is saved and transcribed. */
function meetingRow(m: NonNullable<TrayContext["meetings"]>, item: (a: TrayAction, label: string, x?: Partial<Extract<TrayItem, { type: "item" }>>) => TrayItem): TrayItem {
  const hint = m.shortcut ? { hint: m.shortcut } : {};
  if (m.phase === "ready") return item("meeting-start", at("tray.meeting"), hint);
  if (m.phase === "recording") return item("meeting-stop", at("tray.meetingStop"), hint);
  return item("meeting-start", at(MEETING_WAITING[m.phase]), { enabled: false });
}

type ItemFn = (action: TrayAction, label: string, extra?: Partial<Extract<TrayItem, { type: "item" }>>) => TrayItem;

/** The dictation rows; none where dictation is not supported. */
function dictationRows(c: TrayContext, item: ItemFn): TrayItem[] {
  if (!c.dictation) return [];
  const d = c.dictation;
  const rows: TrayItem[] = [];
  rows.push(item("dictation", at("tray.dictation"), { checked: d.enabled }));
  // A caption, not a command: disabled and without an action of its own.
  if (d.enabled) rows.push(item("dictation-settings", at("tray.hold", { key: hotkeyText(d.hotkey, c.platform) }), { enabled: false }));
  rows.push(item("paste-last", at("tray.pasteLast"), {}));
  if (d.recent?.length) rows.push({ type: "submenu", label: at("tray.copyRecent"), items: d.recent.slice(0, RECENT_ROWS).map((t, i) => item(`dictation-copy-${i}` as TrayAction, recentLabel(t))) });
  rows.push(item("pause-shortcuts", at("tray.pauseShortcuts"), { checked: d.paused === true }));
  rows.push(item("dictation-history", at("tray.history")), item("dictation-settings", at("tray.dictationSettings")));
  return rows;
}

/** The short native menu (right click). One row changes with the engine and update state; reading rows appear while reading. */
export function trayMenuModel(c: TrayContext): TrayItem[] {
  const engine = c.health?.engine.state;
  const item = (action: TrayAction, label: string, extra: Partial<Extract<TrayItem, { type: "item" }>> = {}): TrayItem => ({ type: "item", action, label, enabled: true, ...extra });
  const sep: TrayItem = { type: "separator" };
  const reading = c.reader.status === "playing" || c.reader.status === "preparing";
  const paused = c.reader.status === "paused";
  const rows: TrayItem[] = c.notice ? [item("open", c.notice), sep, item("open", at("tray.open"))] : [item("open", at("tray.open"))];
  rows.push(...dictationRows(c, item));
  if (c.recorder) rows.push(recorderRow(c.recorder.phase, item));
  rows.push(...speechModelItems(c));
  if (c.meetings) rows.push(meetingRow(c.meetings, item));
  if (reading) rows.push(item("pause", at("tray.pause"), { hint: c.shortcuts["play-pause"] }), item("stop", at("tray.stop"), { hint: c.shortcuts.stop }));
  else if (paused) rows.push(item("resume", at("tray.resume"), { hint: c.shortcuts["play-pause"] }), item("stop", at("tray.stop"), { hint: c.shortcuts.stop }));
  if (engine === "unloaded") rows.push(item("wake", at("tray.wake")));
  else if (engine === "error") rows.push(item("restart-engine", at("tray.restartEngine")));
  rows.push(sep, item("dnd", at("notify.dnd"), { checked: c.doNotDisturb }), item("settings", at("tray.settings")));
  if (c.update.kind === "ready") rows.push(item("restart-update", at("tray.restartUpdate", { version: c.update.version })));
  else rows.push(item("check-updates", at(c.update.kind === "checking" ? "tray.checking" : "tray.check"), { enabled: c.update.kind !== "checking" && c.update.kind !== "unsupported" }));
  rows.push(sep, item("quit", at("tray.quit")));
  return rows;
}
