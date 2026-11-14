import { ENGLISH_LANG, listOf, type Lang, type TFn } from "./i18n";
import type { AppState } from "./ipc";
import { exportRunning } from "./export";

type Row = [string, string];

function engineRows(s: AppState, t: TFn): Row[] {
  const engine = s.health?.engine.state;
  if (engine === "downloading") return [[t("quit.download"), t("quit.downloadBody")]];
  if (engine === "ready" || engine === "loading") return [[t("quit.model"), t("quit.modelBody")]];
  return [];
}

function exportRows(exports: number, t: TFn): Row[] {
  if (!exports) return [];
  return [[t("quit.exports", { n: exports }), t("quit.exportsBody")]];
}

function updateRows(s: AppState, t: TFn): Row[] {
  if (s.update.kind !== "ready" || !s.update.onQuit) return [];
  return [[t("quit.update", { version: s.update.version }), t("quit.updateBody")]];
}

/** What the Quit confirmation says: a lead sentence, then what stops and how to get it back. */
export function quitSummary(s: AppState, previewPlaying: boolean, { t, locale }: Lang = ENGLISH_LANG): { lead: string; rows: Row[] } {
  const reading = s.reader.status === "playing" || s.reader.status === "preparing" || s.reader.status === "paused" || previewPlaying;
  const exports = s.exports.filter(exportRunning).length;
  const busy: string[] = [];
  if (reading) busy.push(t("quit.busyReading"));
  if (exports) busy.push(t("quit.busyExports", { n: exports }));

  const rows: Row[] = [[t("quit.server", { port: String(s.port || "-") }), t("quit.serverBody")]];
  if (reading) rows.push([t("quit.reading"), t("quit.readingBody")]);
  rows.push(...exportRows(exports, t), ...engineRows(s, t), ...updateRows(s, t));
  return { lead: busy.length ? t("quit.leadBusy", { busy: listOf(locale, busy) }) : t("quit.leadIdle"), rows };
}
