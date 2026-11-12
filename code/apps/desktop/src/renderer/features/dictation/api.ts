import type { DictationBridge } from "../../../shared/dictation/contract";

declare global {
  interface Window {
    speakkitDictation: DictationBridge;
  }
}

/** The preload's dictation bridge (window.speakkitDictation). */
export const dictation: DictationBridge = window.speakkitDictation;

/** The platform the preload put on the document root ("darwin", "win32"), for labels that name keys. */
export const platformName = (): string => document.documentElement.dataset.platform ?? "win32";
