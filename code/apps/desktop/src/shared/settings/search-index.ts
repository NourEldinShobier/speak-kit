import type { SettingsSub } from "../ipc";
import { SETTING_ROWS, type SettingRowDef } from "./search-rows";

export { SETTING_ROWS, type SettingRowDef };

export interface SearchGroup {
  page: SettingsSub;
  rows: SettingRowDef[];
}

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

/** Rows whose label, keywords or page name contain every typed word, grouped by page in first-seen order. Label hits come before keyword hits. */
export function searchSettings(q: string, pageLabel: (p: SettingsSub) => string, rows: readonly SettingRowDef[] = SETTING_ROWS): SearchGroup[] {
  const w = words(q);
  if (!w.length) return [];
  const scored = rows
    .map((row, i) => {
      const label = row.label.toLowerCase();
      const hay = `${label} ${row.keywords} ${pageLabel(row.page).toLowerCase()}`.toLowerCase();
      return w.every((x) => hay.includes(x)) ? { row, i, inLabel: w.every((x) => label.includes(x)) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => Number(b.inLabel) - Number(a.inLabel) || a.i - b.i);
  const groups: SearchGroup[] = [];
  for (const { row } of scored) {
    const g = groups.find((x) => x.page === row.page);
    if (g) g.rows.push(row);
    else groups.push({ page: row.page, rows: [row] });
  }
  return groups;
}

/** Splits a label around the first occurrence of the typed text so the match can be set in bold. */
export function splitMatch(label: string, q: string): { before: string; match: string; after: string } {
  const w = words(q).sort((a, b) => b.length - a.length)[0];
  const at = w ? label.toLowerCase().indexOf(w) : -1;
  if (at < 0 || !w) return { before: label, match: "", after: "" };
  return { before: label.slice(0, at), match: label.slice(at, at + w.length), after: label.slice(at + w.length) };
}

/** Quick topics shown under an empty search field. */
export const QUICK_TOPICS: readonly string[] = ["Shortcuts", "Microphone", "Memory", "Updates", "Logs"];
