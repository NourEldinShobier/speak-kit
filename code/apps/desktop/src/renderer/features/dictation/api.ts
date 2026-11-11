import type { DictationBridge } from "../../../shared/dictation/contract";

declare global {
  interface Window {
    speakkitDictation: DictationBridge;
  }
}

/** The preload's dictation bridge (window.speakkitDictation). */
export const dictation: DictationBridge = window.speakkitDictation;
