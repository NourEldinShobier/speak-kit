/** Plain constants shared with the sandboxed preload, which cannot load packages: keep valibot and Electron out of this file. */

export const SPEECH_MODEL_METHODS = [
  "view",
  "download",
  "pauseDownload",
  "resumeDownload",
  "cancelDownload",
  "use",
  "cancelSwitch",
  "remove",
  "retryGraphicsCard",
  "importFile",
  "locateFile",
  "removeImported",
  "scanDisk",
  "adoptFound",
  "dismissNewer",
  "continueWithoutModel",
  "measureMemory",
  "openProxySettings",
  "openModelsFolder",
] as const;
export type SpeechModelMethod = (typeof SPEECH_MODEL_METHODS)[number];
export const speechModelChannel = (m: string) => `speakkit:models:${m}`;

/** Main to the app window: the view after every change. */
export const SPEECH_MODELS_EVENT = "speakkit:models:view";
