import type { DictationState } from "@speakkit/dictation";
import { hotkeyText } from "../../shared/dictation/keys";
import type { HudView } from "../../shared/dictation/contract";

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
const SOUND: Button = { label: "Sound settings", id: "sound-settings" };
const TRY_AGAIN: Button = { label: "Try again", id: "retry" };

/** Words, icon and button of each error; a button of "retry" shows only while there is a recording to retry. */
const ERRORS: Record<string, [text: string, icon: Icon, action?: Button]> = {
  "mic-denied": ["Microphone access is blocked", "microphone-off", SOUND],
  "mic-missing": ["No microphone found", "microphone-off", SOUND],
  "mic-busy": ["Another app is using the microphone", "microphone-off"],
  "mic-silent": ["Microphone is muted or too quiet", "microphone-off", SOUND],
  "mic-in-use": ["Another feature is using the microphone", "microphone-off"],
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
export function errorView(code: string, canRetry: boolean, owner?: string): HudView {
  if (code === "mic-in-use") return E(`${owner ?? "Another feature"} is using the microphone`, "microphone-off");
  const [text, icon, action] = ERRORS[code] ?? ["Dictation stopped working", "alert-triangle"];
  return E(text, icon, action?.id === "retry" && !canRetry ? undefined : action);
}

/** The words for an error and whether Try again can run the last take again, for the Settings page. */
export function failureLine(code: string, canRetry: boolean, owner?: string): { text: string; retry: boolean } {
  const v = errorView(code, canRetry, owner);
  return v.kind === "error" ? { text: v.text, retry: v.action?.id === "retry" } : { text: "Dictation stopped working", retry: false };
}

/** The short message after a dictation ended (or none). */
function idleView(notice: Extract<DictationState, { status: "idle" }>["notice"], insertedAsCopy: boolean, secureInput = false): HudView | null {
  if (!notice) return null;
  if (notice.kind === "inserted") return insertedAsCopy ? { kind: "copied", reason: secureInput ? "secure-input" : "clipboard" } : { kind: "pasted" };
  if (notice.kind === "copied") return { kind: "copied", reason: notice.reason === "elevated" ? "elevated" : "clipboard" };
  if (notice.kind === "cancelled") return { kind: "notice", text: "Cancelled", ...(notice.undoable && { action: { label: "Undo", id: "undo-cancel" as const } }) };
  return { kind: "notice", text: "No speech heard" };
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
