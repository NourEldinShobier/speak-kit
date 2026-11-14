import type { MicStatus } from "@speakkit/dictation";
import { MAX_EXCLUSIONS, type DictationConfig, type PasteMethod } from "../../../shared/dictation/settings";

export const OUTPUT_OPTIONS = [
  { id: "restore", label: "Paste and restore" },
  { id: "keep", label: "Paste and keep" },
  { id: "copy", label: "Copy only" },
] as const;

export const OUTPUT_HELP: Record<DictationConfig["output"], string> = {
  restore: "Pastes the text, then puts back what was on your clipboard.",
  keep: "Pastes the text and leaves it on your clipboard.",
  copy: "Only copies the text. Nothing is typed into the app.",
};

export const METHOD_OPTIONS: { value: PasteMethod; label: string }[] = [
  { value: "ctrl-v", label: "Ctrl V" },
  { value: "ctrl-shift-v", label: "Ctrl Shift V" },
  { value: "shift-insert", label: "Shift Insert" },
  { value: "type", label: "Type the text" },
  { value: "copy", label: "Copy only" },
];

export const KEEP_READY_MINUTES = [
  { value: "0", label: "While dictation is on" },
  { value: "5", label: "5 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
];

/** The line under the microphone row, and whether it is a problem. `link` means the operating system privacy page can be opened. */
export function micLine(mic: MicStatus, canOpenPrivacy: boolean): { text: string; problem: boolean; link: boolean } {
  switch (mic.kind) {
    case "ready":
      return { text: `Using ${mic.label}`, problem: false, link: false };
    case "back":
      return { text: `${mic.label} is back`, problem: false, link: false };
    case "bluetooth":
      return { text: `${mic.label} is a headset. Its microphone lowers the sound quality of calls while it records.`, problem: false, link: false };
    case "none":
      return { text: "No microphone found", problem: true, link: false };
    case "built-in-off":
      return { text: "The built-in microphone is off, for example with the lid closed. Connect or pick another microphone.", problem: true, link: false };
    case "busy":
      return { text: "Another app is using the microphone", problem: true, link: false };
    case "blocked":
      return { text: "The microphone is muted or blocked", problem: true, link: mic.privacyLink && canOpenPrivacy };
    case "reconnecting":
      return { text: "Reconnecting the microphone", problem: true, link: false };
    case "lost":
      return { text: "The microphone was lost and could not be reopened. Plug it in again.", problem: true, link: false };
  }
}

/** Adds a word to the list when it is new (any case) and the list has room; returns the list unchanged otherwise. */
export function withExclusion(list: readonly string[], word: string): string[] {
  const w = word.trim().slice(0, 60);
  if (!w || list.length >= MAX_EXCLUSIONS || list.some((x) => x.toLowerCase() === w.toLowerCase())) return [...list];
  return [...list, w];
}
