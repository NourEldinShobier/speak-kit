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

const r = (id: string, label: string, keywords = ""): SettingRowDef => ({ id, page: id.split("/")[0] as SettingsSub, label, keywords });
const adv = (id: string, label: string, keywords = ""): SettingRowDef => ({ ...r(id, label, keywords), advanced: true });

export const SETTING_ROWS: readonly SettingRowDef[] = [
  r("general/launch", "Launch at login", "startup boot sign in"),
  r("general/language", "Language", "locale translation"),
  adv("general/import", "Import settings", "restore load file json backup copy"),
  r("voice/voice", "Voice", "speaker preview"),
  r("voice/speed", "Speed", "rate faster slower"),
  r("shortcuts/read-selection", "Read selection", "hotkey global keys"),
  r("shortcuts/play-pause", "Play or pause", "hotkey global keys"),
  r("shortcuts/record-toggle", "Record a conversation", "hotkey global keys microphone"),
  r("accessibility/keys", "Keyboard map", "keys shortcuts tab arrows"),
  r("whatsnew/notes", "What is new", "release notes changelog changes version"),
  r("performance/idle", "Unload the model when idle", "memory ram"),
  r("performance/battery", "Battery saver", "laptop power"),
  r("storage/models", "Downloaded models", "disk space delete"),
  r("storage/logs", "Logs", "disk space"),
  r("privacy/network", "Network hosts", "internet connections telemetry"),
  r("privacy/microphone", "Microphone access", "permission mic"),
  r("privacy/telemetry", "Telemetry", "analytics tracking nothing sent"),
  r("experiments/list", "Experiments", "beta labs early"),
  r("browser/port", "Port", "server pair extension"),
  r("browser/token", "Pairing token", "extension chrome"),
  r("diagnostics/copy", "Copy diagnostics", "report support bug redacted"),
  r("diagnostics/logs", "Open log folder", "logs debug"),
  r("diagnostics/activity", "Activity log", "errors events history"),
  r("about/version", "Version", "release build"),
  r("about/channel", "Update channel", "stable early beta"),
  r("about/updates", "Check for updates", "update upgrade"),
  r("about/notes", "Release notes", "what is new changelog"),
  r("about/network", "Network table", "hosts internet privacy"),
];
