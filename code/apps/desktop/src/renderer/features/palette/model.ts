import type { Voice } from "@speakkit/protocol";
import type { IconName } from "@speakkit/ui";
import type { Page, SettingsSub } from "../../../shared/ipc";

export type PaletteGroup = "Actions" | "Pages" | "Settings" | "Voices";
export type PaletteAction =
  | { type: "nav"; page: Page; sub?: SettingsSub | undefined }
  | { type: "new-reading" }
  | { type: "pause" }
  | { type: "toggle-reading" }
  | { type: "export" }
  | { type: "check-updates" }
  | { type: "dnd" }
  | { type: "install-extension" }
  | { type: "load-engine" }
  | { type: "copy-token" }
  | { type: "open-logs" }
  | { type: "preview"; voice: string };

export interface Command {
  id: string;
  group: PaletteGroup;
  title: string;
  hint?: string;
  icon: IconName;
  keywords?: string;
  action: PaletteAction;
}

type NavRow = [id: string, group: PaletteGroup, title: string, icon: IconName, page: Page, sub?: SettingsSub | undefined, keywords?: string];

const NAV_ROWS: NavRow[] = [
  ["p-home", "Pages", "Home", "home", "home"],
  ["p-voices", "Pages", "Voices", "microphone", "voices"],
  ["p-engines", "Pages", "Engines", "cpu", "engines", undefined, "kokoro chatterbox model"],
  ["p-browser", "Pages", "Browser", "world", "browser", undefined, "extension pair chrome"],
  ["s-general", "Settings", "Settings: General", "settings", "settings", "general", "launch login tray language"],
  ["s-voice", "Settings", "Settings: Voice and playback", "volume", "settings", "voice", "speed default"],
  ["s-shortcuts", "Settings", "Settings: Shortcuts", "keyboard", "settings", "shortcuts", "global keys hotkey record ctrl alt"],
  ["s-notifications", "Settings", "Settings: Notifications", "bell", "settings", "notifications", "toast bell sound do not disturb"],
  ["s-memory", "Settings", "Settings: Memory", "cpu", "settings", "memory", "idle unload ram battery startup"],
  ["s-browser", "Settings", "Settings: Browser integration", "world", "settings", "browser", "port token pair"],
  ["s-storage", "Settings", "Settings: Storage", "folder", "settings", "storage", "models disk"],
  ["s-about", "Settings", "Settings: About", "info-circle", "settings", "about", "version"],
];

const navCommand = ([id, group, title, icon, page, sub, keywords = ""]: NavRow): Command => ({ id, group, title, icon, keywords, action: { type: "nav", page, sub } });

export function buildCommands(voices: Voice[] = []): Command[] {
  return [
    { id: "new", group: "Actions", title: "New reading", icon: "plus", keywords: "paste text speak read", action: { type: "new-reading" } },
    { id: "pause", group: "Actions", title: "Pause", icon: "player-pause", keywords: "stop playback", action: { type: "pause" } },
    { id: "toggle-reading", group: "Actions", title: "Play or pause reading", icon: "player-play", keywords: "resume mini player", action: { type: "toggle-reading" } },
    { id: "export", group: "Actions", title: "Export audio...", icon: "download", keywords: "save mp3 wav file", action: { type: "export" } },
    { id: "load-engine", group: "Actions", title: "Load the voice engine now", icon: "cpu", keywords: "wake warm", action: { type: "load-engine" } },
    { id: "dnd", group: "Actions", title: "Toggle Do not disturb", icon: "bell", keywords: "notifications quiet toast", action: { type: "dnd" } },
    { id: "check-updates", group: "Actions", title: "Check for updates", icon: "refresh", keywords: "version upgrade", action: { type: "check-updates" } },
    { id: "install-extension", group: "Actions", title: "Install the extension", icon: "brand-chrome", keywords: "chrome edge browser load unpacked", action: { type: "install-extension" } },
    { id: "copy-token", group: "Actions", title: "Copy pairing token", icon: "copy", keywords: "browser extension key", action: { type: "copy-token" } },
    { id: "logs", group: "Actions", title: "Open log folder", icon: "folder", keywords: "debug", action: { type: "open-logs" } },
    ...NAV_ROWS.map(navCommand),
    ...voices.map<Command>((v) => ({
      id: `v-${v.id}`,
      group: "Voices",
      title: `Preview ${v.name}`,
      hint: `${v.lang === "en-US" ? "US" : "UK"} ${v.gender}, grade ${v.quality}`,
      icon: "player-play",
      keywords: `voice ${v.id} ${v.traits ?? ""}`,
      action: { type: "preview", voice: v.id },
    })),
  ];
}

/** Cost of a title match: none at the start, 1 at a word start, 3 inside a word. */
function matchCost(title: string, at: number): number {
  if (at === 0) return 0;
  return title[at - 1] === " " ? 1 : 3;
}

/** Every query word must occur in the title or keywords; title matches rank first, earlier matches before later ones. Empty query keeps the order but drops voices (too many). */
export function filterCommands(all: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return all.filter((c) => c.group !== "Voices");
  const scored: [number, number, Command][] = [];
  all.forEach((c, i) => {
    const t = c.title.toLowerCase();
    const k = `${t} ${c.group.toLowerCase()} ${c.keywords ?? ""}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      const ti = t.indexOf(w);
      if (ti >= 0) score += matchCost(t, ti);
      else if (k.includes(w)) score += 10;
      else return;
    }
    scored.push([score, i, c]);
  });
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((s) => s[2]);
}
