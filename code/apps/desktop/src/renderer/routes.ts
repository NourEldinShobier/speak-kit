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
    items: [
      { page: "home", label: "Home", icon: "home", lead: "Speak Kit runs a private voice server on this computer.", keywords: "start overview" },
      { page: "library", label: "Library", icon: "book", lead: "Everything you saved to read later.", keywords: "readings saved articles" },
    ],
  },
  {
    group: "Voice",
    items: [
      { page: "voices", label: "Voices", icon: "microphone", lead: "Pick a voice and hear it.", keywords: "preview speaker" },
      { page: "voice-chat", label: "Voice chat", icon: "message", lead: "Talk to an assistant out loud.", keywords: "talk conversation openai" },
      { page: "engines", label: "Engines", icon: "package", lead: "The speech engines that run on this computer.", keywords: "kokoro model download" },
    ],
  },
  {
    group: "Dictation",
    items: [
      { page: "dictation", label: "Dictation", icon: "keyboard", lead: "Speak and the text appears where you type.", keywords: "hotkey speech to text" },
      { page: "modes", label: "Modes", icon: "adjustments-horizontal", lead: "How dictated text is cleaned up for each app.", keywords: "style rewrite" },
      { page: "vocabulary", label: "Vocabulary", icon: "book-2", lead: "Words Speak Kit should spell your way.", keywords: "words replacements pronunciation" },
      { page: "history", label: "History", icon: "history", lead: "What you dictated recently.", keywords: "transcripts past" },
    ],
  },
  {
    group: "Capture",
    items: [{ page: "capture", label: "Capture", icon: "scan", lead: "Record the screen and your voice.", keywords: "screen record screenshot" }],
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
      { id: "general", label: "General", icon: "settings", lead: "Startup, language and the tray.", keywords: "launch login tray language" },
      { id: "voice", label: "Voice and playback", icon: "volume", lead: "Used for previews in this app. The extension keeps its own voice and speed.", keywords: "speed default" },
      { id: "shortcuts", label: "Shortcuts", icon: "keyboard", lead: "Global keys and in-app keys.", keywords: "global keys hotkey record ctrl alt" },
      { id: "notifications", label: "Notifications", icon: "bell", lead: "What tells you something happened.", keywords: "toast bell sound do not disturb" },
      { id: "accessibility", label: "Accessibility", icon: "accessible", lead: "Make Speak Kit easier to see and hear.", keywords: "contrast motion screen reader text size" },
    ],
  },
  {
    group: "Device",
    items: [
      { id: "performance", label: "Performance", icon: "cpu", lead: "Memory and battery use.", keywords: "memory idle unload ram battery startup" },
      { id: "storage", label: "Storage", icon: "folder", lead: "Models, audio and data on this computer.", keywords: "models disk" },
      { id: "privacy", label: "Privacy", icon: "lock", lead: "What stays on this computer.", keywords: "data local telemetry permissions" },
    ],
  },
  {
    group: "Features",
    items: [
      { id: "meetings", label: "Meetings", icon: "video", lead: "Record and transcribe meetings.", keywords: "calendar transcript record" },
      { id: "automation", label: "Automation", icon: "terminal", lead: "Let other tools control Speak Kit.", keywords: "api scripts url hooks" },
      { id: "experiments", label: "Experiments", icon: "flask", lead: "Features that are still being tried out.", keywords: "beta labs" },
    ],
  },
  {
    group: "App",
    items: [
      { id: "browser", label: "Browser integration", icon: "world", lead: "Pair the browser extension.", keywords: "port token pair extension chrome" },
      { id: "diagnostics", label: "Diagnostics", icon: "activity", lead: "Logs and checks for when something goes wrong.", keywords: "logs debug problem" },
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
