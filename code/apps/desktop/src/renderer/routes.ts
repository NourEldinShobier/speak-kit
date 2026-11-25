import type { IconName } from "@speakkit/ui";
import type { Page, SettingsSub } from "../shared/ipc";

export type MenuPage = Exclude<Page, "settings">;

export interface MenuItemDef {
  page: MenuPage;
  label: string;
  icon: IconName;
  /** One line under the title of the page, also shown by the placeholder until the page is built. */
  lead: string;
  keywords: string;
}

/** The app menu, top to bottom. */
export const MENU: { group: string; items: MenuItemDef[] }[] = [
  {
    group: "Read",
    items: [{ page: "library", label: "Library", icon: "book", lead: "Everything you saved to read later.", keywords: "readings saved articles" }],
  },
  {
    group: "Voice",
    items: [
      { page: "voices", label: "Voices", icon: "microphone", lead: "Pick a voice and hear it.", keywords: "preview speaker" },
      { page: "voice-chat", label: "Voice chat", icon: "message", lead: "Talk to an assistant out loud.", keywords: "talk conversation openai" },
    ],
  },
  {
    group: "Dictation",
    items: [
      { page: "dictation", label: "Dictation", icon: "keyboard", lead: "Speak and the text appears where you type.", keywords: "hotkey speech to text speech model download" },
      { page: "modes", label: "Modes", icon: "adjustments-horizontal", lead: "How dictated text is cleaned up for each app.", keywords: "style rewrite writer local offline gemma openai" },
      { page: "vocabulary", label: "Vocabulary", icon: "book-2", lead: "Words Speak Kit should spell your way.", keywords: "words heard as suggested pronunciation" },
      { page: "history", label: "History", icon: "history", lead: "What you dictated recently.", keywords: "transcripts past" },
    ],
  },
];

export interface SettingsItemDef {
  id: SettingsSub;
  label: string;
  icon: IconName;
  lead: string;
  keywords: string;
}

/** The Settings sidebar, top to bottom. */
export const SETTINGS_NAV: { group: string; items: SettingsItemDef[] }[] = [
  {
    group: "General",
    items: [
      { id: "general", label: "General", icon: "settings", lead: "Startup and language.", keywords: "launch login language" },
      { id: "shortcuts", label: "Shortcuts", icon: "keyboard", lead: "Global keys and in-app keys.", keywords: "global keys hotkey record ctrl alt" },
      { id: "accessibility", label: "Accessibility", icon: "accessible", lead: "Make Speak Kit easier to see and hear.", keywords: "keyboard contrast screen reader text size" },
    ],
  },
  {
    group: "Device",
    items: [
      { id: "storage", label: "Storage", icon: "folder", lead: "Models, audio and data on this computer.", keywords: "models disk" },
      { id: "privacy", label: "Privacy", icon: "lock", lead: "What stays on this computer.", keywords: "data local permissions" },
    ],
  },
  {
    group: "App",
    items: [
      { id: "browser", label: "Browser integration", icon: "world", lead: "Pair the browser extension.", keywords: "token pair extension chrome" },
      { id: "whatsnew", label: "What is new", icon: "sparkles", lead: "What changed in the version that is running.", keywords: "release notes changelog update version" },
      { id: "about", label: "About", icon: "info-circle", lead: "Speak Kit reads text out loud on your own computer.", keywords: "version update" },
    ],
  },
];

const ALL_MENU = MENU.flatMap((g) => g.items);
const ALL_SETTINGS = SETTINGS_NAV.flatMap((g) => g.items);
export const menuItem = (page: MenuPage): MenuItemDef => ALL_MENU.find((i) => i.page === page)!;
export const settingsItem = (id: SettingsSub): SettingsItemDef => ALL_SETTINGS.find((i) => i.id === id)!;

/** The Settings rows whose label or keywords contain every word typed; groups left empty are dropped. */
export function filterSettingsNav(q: string): typeof SETTINGS_NAV {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return SETTINGS_NAV;
  return SETTINGS_NAV.map((g) => ({
    group: g.group,
    items: g.items.filter((i) => words.every((w) => `${i.label} ${i.keywords}`.toLowerCase().includes(w))),
  })).filter((g) => g.items.length > 0);
}
