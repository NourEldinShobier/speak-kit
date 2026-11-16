/**
 * Dictation core: a hotkey, a recording, a transcript, and the text inserted into the window the user was in.
 * It owns the key state machine, the text rules, the insertion plan and the history. It does not know Electron, Windows, audio APIs or the speech model:
 * those arrive as the ports in `DictationDeps`.
 */
export { createDictation } from "./dictation";
export { defaultSettings, type InsertMode, type Mode, type Replacement, type Retention, type Settings } from "./settings";
export type { HistoryEntry, HistoryHit, HistoryQuery, HistoryStatus, RemoveReport, Version } from "./history";
export { MAX_AUDIO_BYTES, MAX_VERSIONS, planEviction, readStoredHistory, timeLeft, WINDOW_MS } from "./history";
export { historyStats, normalize, rank, type HistoryStats } from "./history-search";
export * from "./mic";
export * from "./capture";
export * from "./ducking";
export * from "./vocabulary";
export * from "./modes";
export type { Mode as WritingMode } from "./modes";
export { applyReplacements, applyRules, traceRules, isNumbersOnly, FILLER_LANGUAGES, FORMATTING_LANGUAGES, SYMBOL_LANGUAGES, type RulesOptions, type RulesTrace } from "./rules";
export { spaceBefore, type CaretContext } from "./spacing";
export type { CopyReason, PastePlan, Target } from "./paste-plan";
export type {
  AudioStore,
  CaptureHandle,
  CaptureResult,
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
