import type { SettingsSub } from "../ipc";

/** One searchable setting. `advanced` rows sit behind their page's Advanced fold; search finds them there too. */
export interface SettingRowDef {
  /** Unique across pages: `<page>/<row>`. Also the `data-setting-row` of the row on its page. */
  id: string;
  page: SettingsSub;
  label: string;
  keywords: string;
  advanced?: boolean;
}

const r = (page: SettingsSub, row: string, label: string, keywords = "", advanced = false): SettingRowDef => ({ id: `${page}/${row}`, page, label, keywords, ...(advanced && { advanced }) });

export const SETTING_ROWS: readonly SettingRowDef[] = [
  r("general", "launch", "Launch at login", "startup boot sign in"),
  r("general", "minimized", "Start minimized to tray", "startup hidden"),
  r("general", "appearance", "Appearance", "theme light dark system colour"),
  r("general", "language", "Language", "locale translation"),
  r("general", "close", "Closing the window", "close quit exit hide tray"),
  r("general", "tray", "Tray icon", "notification area menu bar hide"),
  r("general", "settings-file", "Settings file", "config json folder backup", true),
  r("general", "setup-again", "Run setup again", "first run welcome wizard", true),
  r("voice", "voice", "Voice", "speaker preview"),
  r("voice", "speed", "Speed", "rate faster slower"),
  r("shortcuts", "read-selection", "Read selection", "hotkey global keys"),
  r("shortcuts", "play-pause", "Play or pause", "hotkey global keys"),
  r("shortcuts", "stop", "Stop reading", "hotkey global keys"),
  r("notifications", "events", "Notification events", "toast bell sound"),
  r("notifications", "dnd", "Do not disturb", "quiet silence mute"),
  r("notifications", "volume", "Sound volume", "loud quiet level"),
  r("accessibility", "motion", "Reduce motion", "animation fade still"),
  r("accessibility", "announce", "Screen reader announcements", "narrator voiceover live region"),
  r("accessibility", "keys", "Keyboard map", "keys shortcuts tab arrows"),
  r("performance", "idle", "Unload the model when idle", "memory ram"),
  r("performance", "startup", "Load at startup", "memory warm"),
  r("performance", "battery", "Battery saver", "laptop power"),
  r("performance", "resources", "Memory in use", "ram resources"),
  r("storage", "models", "Downloaded models", "disk space delete"),
  r("storage", "logs", "Logs", "disk space"),
  r("privacy", "network", "Network hosts", "internet connections telemetry"),
  r("privacy", "microphone", "Microphone access", "permission mic"),
  r("privacy", "telemetry", "Telemetry", "analytics tracking nothing sent"),
  r("experiments", "list", "Experiments", "beta labs early"),
  r("browser", "port", "Port", "server pair extension"),
  r("browser", "token", "Pairing token", "extension chrome"),
  r("diagnostics", "copy", "Copy diagnostics", "report support bug redacted"),
  r("diagnostics", "logs", "Open log folder", "logs debug"),
  r("diagnostics", "activity", "Activity log", "errors events history"),
  r("about", "version", "Version", "release build"),
  r("about", "channel", "Update channel", "stable early beta"),
  r("about", "updates", "Check for updates", "update upgrade"),
  r("about", "notes", "Release notes", "what is new changelog"),
  r("about", "network", "Network table", "hosts internet privacy"),
];

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

/** The first result's row: what Enter opens. */
export const firstResult = (groups: readonly SearchGroup[]): SettingRowDef | null => groups[0]?.rows[0] ?? null;

/** Quick topics shown under an empty search field. */
export const QUICK_TOPICS: readonly string[] = ["Shortcuts", "Microphone", "Memory", "Updates", "Logs"];
