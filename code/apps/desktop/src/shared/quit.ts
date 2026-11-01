import { plural } from "@speakkit/protocol";
import type { AppState } from "./ipc";
import { exportRunning } from "./export";

type Row = [string, string];

function engineRows(s: AppState): Row[] {
  const engine = s.health?.engine.state;
  if (engine === "downloading") return [["The model download pauses", "It resumes the next time Speak Kit opens."]];
  if (engine === "ready" || engine === "loading") return [["The voice model leaves memory", "It loads again on the next play."]];
  return [];
}

function exportRows(exports: number): Row[] {
  if (!exports) return [];
  return [[exports === 1 ? "The export is cancelled" : "The exports are cancelled", "Nothing half-written is kept. Export again when Speak Kit is open."]];
}

function updateRows(s: AppState): Row[] {
  if (s.update.kind !== "ready" || !s.update.onQuit) return [];
  return [[`Speak Kit ${s.update.version} installs`, "You chose to install the update when you quit."]];
}

/** What the Quit confirmation (K11) says: a lead sentence, then what stops and how to get it back. */
export function quitSummary(s: AppState, previewPlaying: boolean): { lead: string; rows: Row[] } {
  const reading = s.reader.status === "playing" || s.reader.status === "preparing" || s.reader.status === "paused" || previewPlaying;
  const exports = s.exports.filter(exportRunning).length;
  const busy: string[] = [];
  if (reading) busy.push("1 reading is playing");
  if (exports) busy.push(`${plural(exports, "export", "exports")} ${exports === 1 ? "is" : "are"} rendering`);

  const rows: Row[] = [[`Local server on 127.0.0.1:${s.port || "-"} stops`, "The browser extension cannot read until Speak Kit starts again."]];
  if (reading) rows.push(["The reading in progress stops", "Start it again from the app, the tray or a shortcut."]);
  rows.push(...exportRows(exports), ...engineRows(s), ...updateRows(s));
  return { lead: busy.length ? `${busy.join(" and ")}. Quitting stops:` : "Closing the window keeps Speak Kit in the tray. Quitting stops:", rows };
}
