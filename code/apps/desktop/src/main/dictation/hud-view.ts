import type { DictationState } from "@speakkit/dictation";
import { hotkeyText } from "../../shared/dictation/keys";
import type { HudView } from "../../shared/dictation/contract";
import { at } from "../../shared/i18n";
import "../../shared/i18n/packs/main";

export interface HudInput {
  state: DictationState;
  hotkey: string;
  /** Decides the key names: "Ctrl Alt" or "Control Option". */
  platform: NodeJS.Platform;
  /** When the current recording began (the HUD counts up from it). */
  startedAt: number;
  level: number;
  /** The last insert ended with the text on the clipboard only, whatever the plan said. */
  insertedAsCopy: boolean;
  /** That copy was forced by secure keyboard input (a password field, or an app that left Secure Keyboard Entry on), which blocks synthesized keys. */
  secureInput?: boolean;
  /** A failed recording is kept, so "Try again" can work. */
  canRetry: boolean;
  /** Key that cancels a toggled recording, as a label. */
  cancelLabel?: string;
}

const E = (text: string, icon: Extract<HudView, { kind: "error" }>["icon"], action?: Extract<HudView, { kind: "error" }>["action"]): HudView => ({
  kind: "error",
  text,
  icon,
  ...(action && { action }),
});

type Icon = Extract<HudView, { kind: "error" }>["icon"];
type Button = NonNullable<Extract<HudView, { kind: "error" }>["action"]>;
const sound = (): Button => ({ label: at("hud.soundSettings"), id: "sound-settings" });
const tryAgain = (): Button => ({ label: at("hud.tryAgain"), id: "retry" });

/** Words, icon and button of each error; a button of "retry" shows only while there is a recording to retry. */
const ERRORS = (): Record<string, [text: string, icon: Icon, action?: Button]> => ({
  "mic-denied": [at("hud.err.micDenied"), "microphone-off", sound()],
  "mic-missing": [at("hud.err.micMissing"), "microphone-off", sound()],
  "mic-busy": [at("hud.err.micBusy"), "microphone-off"],
  "mic-silent": [at("hud.err.micSilent"), "microphone-off", sound()],
  "mic-in-use": [at("hud.err.micInUse"), "microphone-off"],
  "focus-failed": [at("hud.err.focus"), "alert-triangle", { label: at("hud.copy"), id: "copy-last" }],
  "model-missing": [at("hud.err.modelMissing"), "download", { label: at("hud.download"), id: "download" }],
  "model-loading": [at("hud.err.modelLoading"), "download", tryAgain()],
  "model-failed": [at("hud.err.modelFailed"), "alert-triangle", tryAgain()],
  "transcribe-failed": [at("hud.err.transcribe"), "alert-triangle", tryAgain()],
  "password-field": [at("hud.err.password"), "lock"],
  "insert-failed": [at("hud.err.insert"), "alert-triangle", { label: at("hud.tryAgain"), id: "paste-again" }],
  "hotkey-failed": [at("hud.err.hotkey"), "alert-triangle"],
});

/** Words and buttons for each error the core can end in. */
export function errorView(code: string, canRetry: boolean, owner?: string): HudView {
  if (code === "mic-in-use") return E(owner ? at("hud.err.micInUseBy", { owner }) : at("hud.err.micInUse"), "microphone-off");
  const [text, icon, action] = ERRORS()[code] ?? [at("hud.err.other"), "alert-triangle"];
  return E(text, icon, action?.id === "retry" && !canRetry ? undefined : action);
}

/** The words for an error and whether Try again can run the last take again, for the Settings page. */
export function failureLine(code: string, canRetry: boolean, owner?: string): { text: string; retry: boolean } {
  const v = errorView(code, canRetry, owner);
  return v.kind === "error" ? { text: v.text, retry: v.action?.id === "retry" } : { text: at("hud.err.other"), retry: false };
}

/** The short message after a dictation ended (or none). */
function idleView(notice: Extract<DictationState, { status: "idle" }>["notice"], insertedAsCopy: boolean, secureInput = false): HudView | null {
  if (!notice) return null;
  if (notice.kind === "inserted") return insertedAsCopy ? { kind: "copied", reason: secureInput ? "secure-input" : "clipboard" } : { kind: "pasted" };
  if (notice.kind === "copied") return { kind: "copied", reason: notice.reason === "elevated" ? "elevated" : "clipboard" };
  if (notice.kind === "cancelled") return { kind: "notice", text: at("hud.cancelled"), ...(notice.undoable && { action: { label: at("hud.undo"), id: "undo-cancel" as const } }) };
  return { kind: "notice", text: at("hud.noSpeech") };
}

/** What the HUD shows for a dictation state, or null when it should be hidden. Idle with nothing to say hides. */
export function hudViewFor(i: HudInput): HudView | null {
  const s = i.state;
  switch (s.status) {
    case "recording":
      return {
        kind: "recording",
        locked: s.mode === "toggle",
        startedAt: i.startedAt,
        level: i.level,
        hotkey: hotkeyText(i.hotkey, i.platform),
        ...(s.mode === "toggle" && i.cancelLabel && { cancel: i.cancelLabel }),
      };
    case "locked":
      return { kind: "recording", locked: true, startedAt: i.startedAt, level: i.level, hotkey: hotkeyText(i.hotkey, i.platform) };
    case "transcribing":
    case "pasting":
      return { kind: "transcribing" };
    case "error":
      return errorView(s.code, i.canRetry, s.owner);
    case "idle":
      return idleView(s.notice, i.insertedAsCopy, i.secureInput);
    default:
      return s satisfies never;
  }
}
