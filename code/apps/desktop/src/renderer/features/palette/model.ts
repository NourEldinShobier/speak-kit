import type { Voice } from "@speakkit/protocol";
import type { IconName } from "@speakkit/ui";
import type { Page, SettingsSub } from "../../../shared/ipc";
import type { DocMeta } from "../../../shared/library/contract";
import { MENU, SETTINGS_NAV } from "../../routes";
import { ENGLISH, type Translator } from "../../i18n";

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

const ACTION_ROWS = [
  ["pause", "player-pause", "stop playback", "pause"],
  ["toggle-reading", "player-play", "resume mini player", "toggle-reading"],
  ["export", "download", "save mp3 wav file", "export"],
  ["load-engine", "cpu", "wake warm", "load-engine"],
  ["dnd", "bell", "notifications quiet toast", "dnd"],
  ["check-updates", "refresh", "version upgrade", "check-updates"],
  ["install-extension", "brand-chrome", "chrome edge browser load unpacked", "install-extension"],
  ["copy-token", "copy", "browser extension key", "copy-token"],
  ["logs", "folder", "debug", "open-logs"],
] as const;

const actionCommands = ({ t }: Translator): Command[] =>
  ACTION_ROWS.map(([id, icon, keywords, type]) => ({ id, group: "Actions", title: t(`pal.${id}`), does: t(`pal.${id}Does`), icon, keywords, action: { type } as PaletteAction }));

const pageCommands = ({ t, label }: Translator) => {
  const pages = MENU.flatMap((g) => g.items).map<Command>((i) => ({
    id: `page-${i.page}`,
    group: "Pages",
    title: t("pal.openPage", { label: label(`page.${i.page}`, i.label) }),
    does: t("pal.openPageDoes", { label: label(`page.${i.page}`, i.label) }),
    icon: i.icon,
    keywords: i.keywords,
    action: { type: "nav", page: i.page },
  }));
  return pages;
};

const settingsCommands = ({ t, label }: Translator) => {
  const settings = SETTINGS_NAV.flatMap((g) => g.items).map<Command>((i) => ({
    id: `s-${i.id}`,
    group: "Settings",
    title: t("pal.openSetting", { label: label(`sub.${i.id}`, i.label) }),
    does: t("pal.openSettingDoes", { label: label(`sub.${i.id}`, i.label) }),
    icon: i.icon,
    keywords: i.keywords,
    action: { type: "nav", page: "settings", sub: i.id },
  }));
  return settings;
};

const readingCommands = (docs: DocMeta[], { t }: Translator) => {
  const readings = docs.map<Command>((d) => ({
    id: `d-${d.id}`,
    group: "Readings",
    title: d.title,
    does: t("pal.readingDoes"),
    hint: t("pal.minutes", { n: Math.max(1, Math.round(d.wordCount / READ_WORDS_PER_MIN)) }),
    icon: "book",
    keywords: d.origin,
    action: { type: "open-doc", id: d.id },
  }));
  return readings;
};

const voiceCommands = (voices: Voice[], { t }: Translator) => {
  const voiceCommands = voices.map<Command>((v) => ({
    id: `v-${v.id}`,
    group: "Voices",
    title: v.name,
    does: t("pal.voiceDoes"),
    hint: t("pal.voiceHint"),
    icon: "microphone",
    keywords: `voice preview ${v.id} ${v.lang === "en-US" ? "us" : "uk"} ${v.gender} ${v.traits ?? ""}`,
    action: { type: "preview", voice: v.id },
  }));
  return voiceCommands;
};

/** Every command in the given language (English by default); the group ids stay English, the screen translates them. */
export function buildCommands(voices: Voice[] = [], docs: DocMeta[] = [], tr: Translator = ENGLISH): Command[] {
  return [...actionCommands(tr), ...pageCommands(tr), ...settingsCommands(tr), ...readingCommands(docs, tr), ...voiceCommands(voices, tr)];
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
