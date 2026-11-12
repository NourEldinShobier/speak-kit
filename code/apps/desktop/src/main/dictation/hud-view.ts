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
export function errorView(code: string, canRetry: boolean): HudView {
  switch (code) {
    case "mic-denied":
      return E("Microphone access is blocked", "microphone-off", { label: "Sound settings", id: "sound-settings" });
    case "mic-missing":
      return E("No microphone found", "microphone-off", { label: "Sound settings", id: "sound-settings" });
    case "mic-busy":
      return E("Another app is using the microphone", "microphone-off");
    case "mic-silent":
      return E("Microphone is muted or too quiet", "microphone-off", { label: "Sound settings", id: "sound-settings" });
    case "focus-failed":
      return E("Could not return to the app. The text is in History", "alert-triangle", { label: "Copy", id: "copy-last" });
    case "model-missing":
      return E("Speech model missing", "download", { label: "Download", id: "download" });
    case "model-loading":
      return E("The speech model is still loading, try again in a moment", "download", canRetry ? { label: "Try again", id: "retry" } : undefined);
    case "model-failed":
      return E("The speech model could not be loaded", "alert-triangle", canRetry ? { label: "Try again", id: "retry" } : undefined);
    case "transcribe-failed":
      return E("Could not transcribe", "alert-triangle", canRetry ? { label: "Try again", id: "retry" } : undefined);
    case "password-field":
      return E("Not typed into a password field", "lock");
    case "insert-failed":
      return E("Could not insert the text", "alert-triangle");
    case "hotkey-failed":
      return E("The hotkey could not start", "alert-triangle");
    default:
      return E("Dictation stopped working", "alert-triangle");
  }
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
