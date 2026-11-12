/**
 * Dictation in the app window: Settings > Dictation (hotkey, mode, language, speech model, replacements, test field), the dictation history,
 * the first-run model card, and the two small pages the app opens in hidden or floating windows (the HUD pill and the microphone page, which have
 * their own entry files next to this one). Loaded on demand: the shell imports this module with import().
 */
export { DictationPage } from "./DictationPage";
export { DictationHistoryPage, historyLeadNow } from "./HistoryPage";
