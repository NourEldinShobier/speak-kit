import type { Voice } from "@speakkit/protocol";
import type { IconName } from "@speakkit/ui";
import type { Page, SettingsSub } from "../../../shared/ipc";
import type { DocMeta } from "../../../shared/library/contract";
import { MENU, SETTINGS_NAV } from "../../routes";

export type PaletteGroup = "Actions" | "Pages" | "Settings" | "Readings" | "Voices";
export type PaletteAction =
  | { type: "nav"; page: Page; sub?: SettingsSub | undefined }
  | { type: "open-doc"; id: string }
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
  /** What will happen when it runs, shown on the best-match card before anything is run. */
  does: string;
  hint?: string;
  icon: IconName;
  keywords?: string;
  action: PaletteAction;
}

/** Commands shown under "Recent" until the person has run any. */
export const DEFAULT_RECENT = ["page-dictation", "toggle-reading", "export"];
export const MAX_RECENT_COMMANDS = 3;
const MAX_RESULTS = 30;
const READ_WORDS_PER_MIN = 160;

const ACTIONS: Command[] = [
  { id: "pause", group: "Actions", title: "Pause", does: "Pauses the reading that is playing.", icon: "player-pause", keywords: "stop playback", action: { type: "pause" } },
  {
    id: "toggle-reading",
    group: "Actions",
    title: "Play or pause reading",
    does: "Plays or pauses the current reading.",
    icon: "player-play",
    keywords: "resume mini player",
    action: { type: "toggle-reading" },
  },
  {
    id: "export",
    group: "Actions",
    title: "Export audio",
    does: "Opens the export dialog to save speech as an audio file.",
    icon: "download",
    keywords: "save mp3 wav file",
    action: { type: "export" },
  },
  {
    id: "load-engine",
    group: "Actions",
    title: "Load the voice engine now",
    does: "Loads the voice engine into memory so the next reading starts at once.",
    icon: "cpu",
    keywords: "wake warm",
    action: { type: "load-engine" },
  },
  { id: "dnd", group: "Actions", title: "Toggle Do not disturb", does: "Turns pop-ups and sounds off, or back on.", icon: "bell", keywords: "notifications quiet toast", action: { type: "dnd" } },
  {
    id: "check-updates",
    group: "Actions",
    title: "Check for updates",
    does: "Looks for a newer version of Speak Kit.",
    icon: "refresh",
    keywords: "version upgrade",
    action: { type: "check-updates" },
  },
  {
    id: "install-extension",
    group: "Actions",
    title: "Install the extension",
    does: "Opens Browser integration, where you add the extension.",
    icon: "brand-chrome",
    keywords: "chrome edge browser load unpacked",
    action: { type: "install-extension" },
  },
  {
    id: "copy-token",
    group: "Actions",
    title: "Copy pairing token",
    does: "Copies the token the extension needs to the clipboard.",
    icon: "copy",
    keywords: "browser extension key",
    action: { type: "copy-token" },
  },
  { id: "logs", group: "Actions", title: "Open log folder", does: "Shows the folder with the log files.", icon: "folder", keywords: "debug", action: { type: "open-logs" } },
];

const pageCommands = () => {
  const pages = MENU.flatMap((g) => g.items).map<Command>((i) => ({
    id: `page-${i.page}`,
    group: "Pages",
    title: `Open ${i.label}`,
    does: `Opens the ${i.label} page.`,
    icon: i.icon,
    keywords: i.keywords,
    action: { type: "nav", page: i.page },
  }));
  return pages;
};

const settingsCommands = () => {
  const settings = SETTINGS_NAV.flatMap((g) => g.items).map<Command>((i) => ({
    id: `s-${i.id}`,
    group: "Settings",
    title: `Settings: ${i.label}`,
    does: `Opens Settings on ${i.label}.`,
    icon: i.icon,
    keywords: i.keywords,
    action: { type: "nav", page: "settings", sub: i.id },
  }));
  return settings;
};

const readingCommands = (docs: DocMeta[]) => {
  const readings = docs.map<Command>((d) => ({
    id: `d-${d.id}`,
    group: "Readings",
    title: d.title,
    does: "Opens this reading in the Library.",
    hint: `${Math.max(1, Math.round(d.wordCount / READ_WORDS_PER_MIN))} min`,
    icon: "book",
    keywords: d.origin,
    action: { type: "open-doc", id: d.id },
  }));
  return readings;
};

const voiceCommands = (voices: Voice[]) => {
  const voiceCommands = voices.map<Command>((v) => ({
    id: `v-${v.id}`,
    group: "Voices",
    title: v.name,
    does: "Plays a short sample of this voice.",
    hint: "Voice",
    icon: "microphone",
    keywords: `voice preview ${v.id} ${v.lang === "en-US" ? "us" : "uk"} ${v.gender} ${v.traits ?? ""}`,
    action: { type: "preview", voice: v.id },
  }));
  return voiceCommands;
};

export function buildCommands(voices: Voice[] = [], docs: DocMeta[] = []): Command[] {
  return [...ACTIONS, ...pageCommands(), ...settingsCommands(), ...readingCommands(docs), ...voiceCommands(voices)];
}

/** Cost of a title match: none at the start, 1 at a word start, 3 inside a word. */
function matchCost(title: string, at: number): number {
  if (at === 0) return 0;
  return title[at - 1] === " " ? 1 : 3;
}

/** Every query word must occur in the title or keywords; title matches rank first, earlier matches before later ones. An empty query matches nothing. */
export function filterCommands(all: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
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
  return scored
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, MAX_RESULTS)
    .map((s) => s[2]);
}

export interface PaletteSection {
  label: string;
  items: Command[];
}

export interface PaletteView {
  /** The first match, shown as a card with what it will do; null while the query is empty. */
  best: Command | null;
  sections: PaletteSection[];
  /** Every command in the order the arrow keys walk: best first, then the sections top to bottom. */
  flat: Command[];
}

/** Moves the id of a command to the front of the recent list: no repeats, newest first, at most MAX_RECENT_COMMANDS. */
export const rememberCommand = (recent: string[], id: string): string[] => [id, ...recent.filter((r) => r !== id)].slice(0, MAX_RECENT_COMMANDS);

/** What the palette shows. Empty query: Recent (commands run before, else the defaults) and the other actions. Otherwise: the best match, then the rest grouped by kind. */
export function paletteView(all: Command[], query: string, recent: string[]): PaletteView {
  if (!query.trim()) {
    const known = recent.length ? recent : DEFAULT_RECENT;
    const rec = known.map((id) => all.find((c) => c.id === id)).filter((c): c is Command => !!c);
    const recIds = new Set(rec.map((c) => c.id));
    const sections = [
      { label: "Recent", items: rec },
      { label: "Actions", items: all.filter((c) => c.group === "Actions" && !recIds.has(c.id)) },
    ].filter((s) => s.items.length);
    return { best: null, sections, flat: sections.flatMap((s) => s.items) };
  }
  const hits = filterCommands(all, query);
  const [best, ...rest] = hits;
  const sections: PaletteSection[] = [];
  for (const c of rest) {
    const section = sections.find((s) => s.label === c.group);
    if (section) section.items.push(c);
    else sections.push({ label: c.group, items: [c] });
  }
  // Arrow keys walk the sections as drawn, so the flat order is the grouped one.
  return { best: best ?? null, sections, flat: [...(best ? [best] : []), ...sections.flatMap((s) => s.items)] };
}
