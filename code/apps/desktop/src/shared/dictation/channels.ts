/** Plain constants shared with the sandboxed preload, which cannot load packages: keep valibot and Electron out of this file. */

export const DICTATION_METHODS = [
  "status",
  "setEnabled",
  "patchSettings",
  "downloadModel",
  "cancelDownload",
  "historyList",
  "historyCopy",
  "historyRemove",
  "historyClear",
  "historyRemoveMany",
  "historyStats",
  "micDevices",
  "micMeter",
  "retry",
  "setPaused",
  "pasteLast",
  "undoCancel",
  "openSoundSettings",
  "historyRecent",
  "historyUseVersion",
  "historyRetranscribe",
  "historyCancelRetranscribe",
  "historyAudio",
  "historyDeleteRecording",
  "historyExport",
  "historyDismissNotice",
  "vocabImport",
  "vocabExport",
  "openMicrophoneSettings",
  "installedApps",
] as const;
export type DictationMethod = (typeof DICTATION_METHODS)[number];
export const dictationChannel = (m: string) => `speakkit:dictation:${m}`;

/** Main to the app window: the status after every change. */
export const STATUS_EVENT = "speakkit:dictation:status";

/** Main to the HUD page: what to draw. */
export const HUD_EVENT = "speakkit:dictation:hud";

/** The HUD page asks for something (Sound settings, Download, Try again) or dismisses itself. */
export const HUD_ACTION = "speakkit:dictation:hud-action";
export const HUD_ACTIONS = ["sound-settings", "download", "retry", "undo-cancel", "cancel-recording", "dismiss", "copy-last", "paste-again"] as const;
export type HudAction = (typeof HUD_ACTIONS)[number];

/** Microphone window: main sends commands, the window answers each one and reports the level while recording. */
export const REC_COMMAND = "speakkit:dictation:rec-command";
export const REC_REPLY = "speakkit:dictation:rec-reply";
export const REC_LEVEL = "speakkit:dictation:rec-level";
export const REC_READY = "speakkit:dictation:rec-ready";
/** The microphone window hands over the audio of a running recording in pieces, so a crash loses at most the last piece. */
export const REC_CHUNK = "speakkit:dictation:rec-chunk";
/** The microphone window reports what happened to the microphone itself: silent, lost, reopening, back. */
/** Main to the app window: the microphone level while the Audio card is open. */
export const MIC_LEVEL_EVENT = "speakkit:dictation:mic-level";
export const REC_EVENT = "speakkit:dictation:rec-event";
