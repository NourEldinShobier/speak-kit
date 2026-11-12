/**
 * Dictation in the app window: Settings > Dictation (hotkey, mode, language, speech model, replacements, test field), the dictation history,
 * the first-run model card, and the two small pages the app opens in hidden or floating windows (the HUD pill and the microphone page, which have
 * their own entry files next to this one). Loaded on demand: the shell imports this module with import().
 */
export { DictationPage } from "./DictationPage";
export { DictationHistoryPage } from "./HistoryPage";
// What the setup window's dictation step uses: the bridge, the status hook and the HUD pill drawing.
export { dictation } from "./api";
export { useDictation } from "./useDictation";
export { Pill } from "./HudPill";
