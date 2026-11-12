import type { DictationConfig } from "../../shared/dictation/settings";
import { captureSelection } from "../system/selection";
import { electronClipboard } from "../system/clipboard";
import { sendCopyKeys, sendSelectAllKeys } from "../system/keys";
import type { DictationOs } from "./index";
import { transformTyped, typedTextRules, type TransformResult } from "./transform-typed";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** What the person is told, per result. */
export const TRANSFORM_TOAST: Record<string, string> = {
  changed: "Cleaned up the text",
  unchanged: "Nothing to clean up",
  "nothing-selected": "Nothing to clean up, the field is empty",
  "password-field": "Not used in a password field",
  terminal: "Not used in a terminal",
  elevated: "Cannot reach a window that runs as administrator",
  "secure-input": "The program blocks keys, nothing was changed",
  "no-window": "No window to clean up",
  "copy-unstable": "The text changed while it was read, nothing was changed",
  "window-changed": "The window changed, nothing was changed",
  "not-inserted": "Could not paste the cleaned text, nothing was changed",
};

export const transformToast = (r: TransformResult): { text: string; tone: "ok" | "error" } => ({
  text: TRANSFORM_TOAST[r.status === "blocked" || r.status === "failed" ? r.reason : r.status] ?? "Nothing was changed",
  tone: r.status === "changed" || r.status === "unchanged" ? "ok" : "error",
});

/** Cleans the focused field with the dictation rules; every step on the real system. */
export function runTransform(os: DictationOs, cfg: DictationConfig): Promise<TransformResult> {
  return transformTyped({
    foreground: () => os.foreground(),
    passwordFocused: () => os.passwordFocused(),
    selectAll: sendSelectAllKeys,
    copy: () => captureSelection({ clip: electronClipboard, copy: sendCopyKeys, sleep }),
    insert: (text, options) => os.insert(text, options),
    clean: typedTextRules(cfg),
  });
}
