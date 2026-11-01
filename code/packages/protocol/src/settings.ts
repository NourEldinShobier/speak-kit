import { DEFAULT_PORT, DEFAULT_VOICE } from "./constants";

export type SiteRule = "always-dock" | "hide-controls" | "never-read";
export interface Settings {
  port: number;
  launcher: { enabled: boolean; side: "left" | "right"; idle: "peek" | "hidden" | "open"; openOn: "hover" | "click"; closeDelayMs: number; widerWhileReading: boolean; y: number };
  show: { bubble: boolean; dock: boolean; gutter: boolean; contextMenu: boolean; autoScroll: boolean };
  voice: string;
  speed: number;
  pauseBetweenParagraphs: "none" | "short" | "long";
  highlight: { mode: "sentence+word" | "sentence" | "word" | "off"; sentenceColor: string; wordColor: string; matchTheme: boolean };
  skip: { navigation: boolean; citations: boolean; code: boolean; urls: boolean; captions: boolean };
  sites: Record<string, SiteRule>;
}
/** The pairing token lives in chrome.storage.local under TOKEN_KEY, never in sync storage. */
export const TOKEN_KEY = "speakkit.token";
export const SETTINGS_KEY = "speakkit.settings";

export const defaultSettings = (): Settings => ({
  port: DEFAULT_PORT,
  launcher: { enabled: true, side: "right", idle: "peek", openOn: "hover", closeDelayMs: 1500, widerWhileReading: true, y: 0.42 },
  show: { bubble: true, dock: true, gutter: true, contextMenu: true, autoScroll: true },
  voice: DEFAULT_VOICE,
  speed: 1.2,
  pauseBetweenParagraphs: "short",
  highlight: { mode: "sentence+word", sentenceColor: "#FFF1C2", wordColor: "#FFD24D", matchTheme: true },
  skip: { navigation: true, citations: true, code: true, urls: true, captions: false },
  sites: {},
});
