/**
 * Dictation core: a hotkey, a recording, a transcript, and the text inserted into the window the user was in.
 * It owns the key state machine, the text rules, the insertion plan and the history. It does not know Electron, Windows, audio APIs or the speech model:
 * those arrive as the ports in `DictationDeps`.
 */
export { createDictation } from "./dictation";
export { defaultSettings, type InsertMode, type Mode, type Replacement, type Retention, type Settings } from "./settings";
export type { HistoryEntry } from "./history";
export type { CopyReason, PastePlan, Target } from "./paste-plan";
export type {
  Clip,
  Clock,
  Dictation,
  DictationDeps,
  DictationErrorCode,
  DictationState,
  HistoryStorage,
  HotkeySource,
  Inserter,
  KeyEvent,
  MicErrorCode,
  Notice,
  Recorder,
  TranscribeResult,
  Transcriber,
  Unsubscribe,
} from "./types";
