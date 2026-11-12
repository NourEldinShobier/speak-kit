import type { SpeechModelsBridge } from "../../../shared/speech-models/contract";

declare global {
  interface Window {
    speakkitModels: SpeechModelsBridge;
  }
}

/** The preload's speech models bridge (window.speakkitModels). */
export const models: SpeechModelsBridge = window.speakkitModels;
