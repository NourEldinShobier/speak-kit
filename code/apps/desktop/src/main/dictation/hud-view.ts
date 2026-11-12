import type { DictationState } from "@speakkit/dictation";
import { hotkeyText } from "../../shared/dictation/keys";
import type { HudView } from "../../shared/dictation/contract";

export interface HudInput {
  state: DictationState;
  hotkey: string;
  /** When the current recording began (the HUD counts up from it). */
  startedAt: number;
  level: number;
  /** The last insert ended with the text on the clipboard only, whatever the plan said. */
  insertedAsCopy: boolean;
  /** A failed recording is kept, so "Try again" can work. */
  canRetry: boolean;
}

const E = (text: string, icon: Extract<HudView, { kind: "error" }>["icon"], action?: Extract<HudView, { kind: "error" }>["action"]): HudView => ({
  kind: "error",
  text,
  icon,
  ...(action && { action }),
});

/** Words and buttons for each error the core can end in. */
type Icon = Extract<HudView, { kind: "error" }>["icon"];
type Button = NonNullable<Extract<HudView, { kind: "error" }>["action"]>;
const SOUND: Button = { label: "Sound settings", id: "sound-settings" };
const TRY_AGAIN: Button = { label: "Try again", id: "retry" };

/** Words, icon and button of each error; a button of "retry" shows only while there is a recording to retry. */
const ERRORS: Record<string, [text: string, icon: Icon, action?: Button]> = {
  "mic-denied": ["Microphone access is blocked", "microphone-off", SOUND],
  "mic-missing": ["No microphone found", "microphone-off", SOUND],
  "mic-busy": ["Another app is using the microphone", "microphone-off"],
  "mic-silent": ["Microphone is muted or too quiet", "microphone-off", SOUND],
  "focus-failed": ["Could not return to the app. The text is in History", "alert-triangle", { label: "Copy", id: "copy-last" }],
  "model-missing": ["Speech model missing", "download", { label: "Download", id: "download" }],
  "model-loading": ["The speech model is still loading, try again in a moment", "download", TRY_AGAIN],
  "model-failed": ["The speech model could not be loaded", "alert-triangle", TRY_AGAIN],
  "transcribe-failed": ["Could not transcribe", "alert-triangle", TRY_AGAIN],
  "password-field": ["Not typed into a password field", "lock"],
  "insert-failed": ["Could not insert the text. It is in History", "alert-triangle", { label: "Try again", id: "paste-again" }],
  "hotkey-failed": ["The hotkey could not start", "alert-triangle"],
};

/** Words and buttons for each error the core can end in. */
export function errorView(code: string, canRetry: boolean): HudView {
  const [text, icon, action] = ERRORS[code] ?? ["Dictation stopped working", "alert-triangle"];
  return E(text, icon, action?.id === "retry" && !canRetry ? undefined : action);
}

/** What the HUD shows for a dictation state, or null when it should be hidden. Idle with nothing to say hides. */
export function hudViewFor(i: HudInput): HudView | null {
  const s = i.state;
  switch (s.status) {
    case "recording":
      return { kind: "recording", locked: s.mode === "toggle", startedAt: i.startedAt, level: i.level, hotkey: hotkeyText(i.hotkey) };
    case "locked":
      return { kind: "recording", locked: true, startedAt: i.startedAt, level: i.level, hotkey: hotkeyText(i.hotkey) };
    case "transcribing":
    case "pasting":
      return { kind: "transcribing" };
    case "error":
      return errorView(s.code, i.canRetry);
    case "idle":
      if (!s.notice) return null;
      if (s.notice.kind === "inserted") return i.insertedAsCopy ? { kind: "copied", reason: "clipboard" } : { kind: "pasted" };
      if (s.notice.kind === "copied") return { kind: "copied", reason: s.notice.reason === "elevated" ? "elevated" : "clipboard" };
      if (s.notice.kind === "cancelled") return s.notice.restorable ? { kind: "notice", text: "Cancelled", action: { label: "Restore", id: "restore" } } : { kind: "notice", text: "Cancelled" };
      return { kind: "notice", text: "No speech heard" };
    default:
      return s satisfies never;
  }
}
