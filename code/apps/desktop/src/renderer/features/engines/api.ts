import type { EnginesPatch } from "../../../shared/speech-models/config";
import type { SpeechModelsBridge } from "../../../shared/speech-models/contract";
import { patchViaRegistry } from "../../registry-patch";

declare global {
  interface Window {
    speakkitModels: SpeechModelsBridge;
  }
}

/** The preload's speech models bridge (window.speakkitModels). */
export const models: SpeechModelsBridge = window.speakkitModels;

/** Changes the choices of the Engines page through the settings registry, then reads the view again; a refusal throws its message. */
export const patchEngines = (patch: EnginesPatch) => patchViaRegistry("engines", patch, { status: () => models.view() });
