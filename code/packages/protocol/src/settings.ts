import { DEFAULT_VOICE } from "./constants";

export type SiteRule = "always-dock" | "hide-controls" | "never-read";
/** What a site without a rule gets: the normal controls ("ask": nothing is read until the user presses play) or no reading at all. */
export type SiteDefault = "ask" | "never-read";
export interface Settings {
  launcher: { enabled: boolean; y: number };
  show: { bubble: boolean; dock: boolean; gutter: boolean; contextMenu: boolean; autoScroll: boolean };
  voice: string;
  speed: number;
  pauseBetweenParagraphs: "none" | "short" | "long";
  highlight: { mode: "sentence+word" | "sentence" | "word" | "off"; sentenceColor: string; wordColor: string; matchTheme: boolean };
  skip: { navigation: boolean; citations: boolean; code: boolean; urls: boolean; captions: boolean };
  sites: Record<string, SiteRule>;
  siteDefault: SiteDefault;
}
/** The pairing token lives in chrome.storage.local under TOKEN_KEY, never in sync storage. */
export const TOKEN_KEY = "speakkit.token";
/** The port the app answered on last, in chrome.storage.local under PORT_KEY. The extension finds it itself (the default port, then the ones the app falls back to); no one types it. */
export const PORT_KEY = "speakkit.port";
export const SETTINGS_KEY = "speakkit.settings";

/** Highlight colours used when the user has not picked any (light page). */
export const DEFAULT_SENTENCE_COLOR = "#FFF1C2";
export const DEFAULT_WORD_COLOR = "#FFD24D";

/** A fresh copy of the settings a new install starts with. */
export const defaultSettings = (): Settings => ({
  launcher: { enabled: true, y: 0.42 },
  show: { bubble: true, dock: true, gutter: true, contextMenu: true, autoScroll: true },
  voice: DEFAULT_VOICE,
  speed: 1.2,
  pauseBetweenParagraphs: "short",
  highlight: { mode: "sentence+word", sentenceColor: DEFAULT_SENTENCE_COLOR, wordColor: DEFAULT_WORD_COLOR, matchTheme: true },
  skip: { navigation: true, citations: true, code: true, urls: true, captions: false },
  sites: {},
  siteDefault: "ask",
});
