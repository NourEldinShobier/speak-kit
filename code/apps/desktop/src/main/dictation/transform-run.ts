import type { DictationConfig } from "../../shared/dictation/settings";
import { captureSelection } from "../system/selection";
import { electronClipboard } from "../system/clipboard";
import { sendCopyKeys, sendSelectAllKeys } from "../system/keys";
import type { DictationOs } from "./index";
import { transformTyped, typedTextRules, type TransformResult } from "./transform-typed";
import { at, type StringKey } from "../../shared/i18n";
import "../../shared/i18n/packs/main";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** What the person is told, per result. */
export const TRANSFORM_TOAST: Record<string, StringKey> = {
  changed: "hud.clean.changed",
  "nothing-left": "hud.clean.nothingLeft",
  "too-long": "hud.clean.tooLong",
  unchanged: "hud.clean.unchanged",
  "nothing-selected": "hud.clean.empty",
  "password-field": "hud.clean.password",
  terminal: "hud.clean.terminal",
  elevated: "hud.clean.elevated",
  "secure-input": "hud.clean.secure",
  "no-window": "hud.clean.noWindow",
  "copy-unstable": "hud.clean.unstable",
  "window-changed": "hud.clean.windowChanged",
  "not-inserted": "hud.clean.notInserted",
};

/** The field comes back as plain text, so formatting in a rich editor is lost; the undo shortcut brings it back. */
const undoHint = (platform: string) => ` ${at("hud.clean.undo", { key: platform === "darwin" ? "Cmd" : "Ctrl" })}`;

export const transformToast = (r: TransformResult, platform: string = process.platform): { text: string; tone: "ok" | "error" } => ({
  text: at(TRANSFORM_TOAST[r.status === "blocked" || r.status === "failed" ? r.reason : r.status] ?? "hud.clean.default") + (r.status === "changed" ? undoHint(platform) : ""),
  tone: r.status === "changed" || r.status === "unchanged" ? "ok" : "error",
});

/** Cleans the focused field with the dictation rules; every step on the real system. */
export function runTransform(os: DictationOs, cfg: DictationConfig): Promise<TransformResult> {
  return transformTyped({
    foreground: () => os.foreground(),
    passwordFocused: () => os.passwordFocused(),
    hasSelection: async () => (await os.caret?.read())?.selected,
    selectAll: sendSelectAllKeys,
    copy: () => captureSelection({ clip: electronClipboard, copy: sendCopyKeys, sleep }),
    insert: (text, options) => os.insert(text, options),
    clean: typedTextRules(cfg),
  });
}
