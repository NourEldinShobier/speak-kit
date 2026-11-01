import type { AppState } from "./ipc";
import { exportRunning } from "./export";

/** What the Quit confirmation (K11) says: a lead sentence, then what stops and how to get it back. */
export function quitSummary(s: AppState, previewPlaying: boolean): { lead: string; rows: [string, string][] } {
  const engine = s.health?.engine.state;
  const reading = s.reader.status === "playing" || s.reader.status === "preparing" || s.reader.status === "paused" || previewPlaying;
  const exports = s.exports.filter(exportRunning).length;
  const busy: string[] = [];
  if (reading) busy.push("1 reading is playing");
  if (exports) busy.push(`${exports} ${exports === 1 ? "export is" : "exports are"} rendering`);

  const rows: [string, string][] = [[`Local server on 127.0.0.1:${s.port || "-"} stops`, "The browser extension cannot read until SpeakKit starts again."]];
  if (reading) rows.push(["The reading in progress stops", "Start it again from the app, the tray or a shortcut."]);
  if (exports) rows.push([exports === 1 ? "The export is cancelled" : "The exports are cancelled", "Nothing half-written is kept. Export again when SpeakKit is open."]);
  if (engine === "downloading") rows.push(["The model download pauses", "It resumes the next time SpeakKit opens."]);
  if (engine === "ready" || engine === "loading") rows.push(["The voice model leaves memory", "It loads again on the next play."]);
  if (s.update.kind === "ready" && s.update.onQuit) rows.push([`SpeakKit ${s.update.version} installs`, "You chose to install the update when you quit."]);
  return { lead: busy.length ? `${busy.join(" and ")}. Quitting stops:` : "Closing the window keeps SpeakKit in the tray. Quitting stops:", rows };
}
