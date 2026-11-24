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

/** The line under the page title, for the mode in use. */
export const shortcutLead: Record<Mode, string> = {
  hold: "Hold the key to talk. Let go to insert the text.",
  "hold-only": "Hold the key to talk. Let go to insert the text.",
  toggle: "Tap the key to start. Tap it again to insert the text.",
  "double-tap": "Double-tap the key to start. Tap it once to insert the text.",
  "tap-or-hold": "Hold the key to talk, or tap it to start and tap again to finish.",
};

export const isDefault = (slot: "dictation" | "pasteLast", value: string): boolean => value === (slot === "dictation" ? DEFAULT_HOTKEY : DEFAULT_PASTE_LAST);

/** Every shortcut the recorder must keep apart, from the status. */
export function allShortcuts(s: DictationStatus): Shortcuts {
  const c = s.settings;
  return { dictation: c.hotkey, pasteLast: c.pasteLastHotkey, learn: c.learnHotkey, cancel: c.cancelKey, ...s.readerShortcuts };
}

export const conflictText = (hotkey: string, other: Slot): string => `${hotkeyText(hotkey)} is already the ${SLOT_NAMES[other]}. Pick another shortcut.`;

export const resetNoticeText = {
  clash: "Two shortcuts shared a key, so the extra one was cleared.",
} as const;
