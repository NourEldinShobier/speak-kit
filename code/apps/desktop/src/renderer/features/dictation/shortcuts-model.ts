import { SLOT_NAMES, type Shortcuts, type Slot } from "../../../shared/dictation/conflicts";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { DEFAULT_HOTKEY, DEFAULT_PASTE_LAST, hotkeyText } from "../../../shared/dictation/keys";
import type { DictationConfig } from "../../../shared/dictation/settings";

type Mode = DictationConfig["mode"];

export const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "hold", label: "Hold or double-tap" },
  { value: "hold-only", label: "Hold" },
  { value: "toggle", label: "Tap" },
  { value: "double-tap", label: "Double-tap only" },
  { value: "tap-or-hold", label: "Tap or hold" },
];

export const HOLD_TIME_OPTIONS = [150, 200, 300, 400, 500, 750, 1000].map((ms) => ({ value: String(ms), label: `${ms} ms` }));

/** The line under the page title, for the mode in use. */
export const shortcutLead: Record<Mode, string> = {
  hold: "Hold the key to talk. Let go to insert the text.",
  "hold-only": "Hold the key to talk. Let go to insert the text.",
  toggle: "Tap the key to start. Tap it again to insert the text.",
  "double-tap": "Double-tap the key to start. Tap it once to insert the text.",
  "tap-or-hold": "Hold the key to talk, or tap it to start and tap again to finish.",
};

export interface ModeRule {
  label: string;
  text: string;
  badge: string;
}

/** The rules under "How <mode> works": what each kind of press does. */
export function modeRules(mode: Mode, holdMs: number): ModeRule[] {
  const hold: ModeRule = { label: `Hold longer than ${holdMs} ms`, text: "Dictates until you let go, then inserts the text.", badge: "Hold" };
  const tap: ModeRule = { label: "Tap and let go", text: "Starts dictation. Tap again to finish.", badge: "Tap" };
  const short: ModeRule = { label: `Press shorter than ${holdMs} ms`, text: "Ignored. No tone, nothing pasted.", badge: "Ignored" };
  const double: ModeRule = { label: `Double-tap within 300 ms`, text: "Locks the recording on. Press once more to finish.", badge: "Lock" };
  const others: ModeRule = { label: "Keys in other apps", text: "Only your shortcut ends a dictation. A key pressed in another app never cancels it.", badge: "Safe" };
  switch (mode) {
    case "hold":
      return [hold, short, double];
    case "hold-only":
      return [hold, short];
    case "toggle":
      return [tap, { label: "Cancel key", text: "Cancels a recording that is running. Nothing is inserted.", badge: "Cancel" }];
    case "double-tap":
      return [double, { label: "Single press or hold", text: "Does nothing, so the key keeps its normal job.", badge: "Ignored" }];
    case "tap-or-hold":
      return [hold, tap, others];
  }
}

export const modeTitle = (mode: Mode): string => MODE_OPTIONS.find((o) => o.value === mode)?.label ?? "";

const FRAMES: Record<Mode, ("hold" | "tap" | "double")[]> = { hold: ["hold", "double"], "hold-only": ["hold"], toggle: ["tap"], "double-tap": ["double"], "tap-or-hold": ["hold", "tap"] };

/** Which keycap frames the explainer shows: the second frame is the press that lasts, the first is the short tap. */
export function explainerFrames(mode: Mode): ("hold" | "tap" | "double")[] {
  return FRAMES[mode];
}

export const shareAvailable = (mode: Mode): { ok: boolean; reason: string } =>
  mode === "hold-only" ? { ok: true, reason: "" } : { ok: false, reason: "Hands-free modes cannot keep the other app's key held. Switch the mode to Hold to share the shortcut." };

export const isDefault = (slot: "dictation" | "pasteLast", value: string): boolean => value === (slot === "dictation" ? DEFAULT_HOTKEY : DEFAULT_PASTE_LAST);

/** Every shortcut the recorder must keep apart, from the status. */
export function allShortcuts(s: DictationStatus): Shortcuts {
  const c = s.settings;
  return { dictation: c.hotkey, second: c.secondHotkey, mouse: c.mouseButton, raw: c.rawHotkey, pasteLast: c.pasteLastHotkey, cancel: c.cancelKey, ...s.readerShortcuts };
}

export const conflictText = (hotkey: string, other: Slot): string => `${hotkeyText(hotkey)} is already the ${SLOT_NAMES[other]}. Pick another shortcut.`;

export const resetNoticeText = {
  "left-click": "The saved left mouse button was reset to the default shortcut. The left button cannot be a shortcut.",
  clash: "Two shortcuts shared a key, so the extra one was cleared.",
} as const;

/** "game.exe, Editor" as a list: trimmed, without empty entries, at most 50. */
export const parseApps = (text: string): string[] =>
  text
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 50);
