import type { Mode } from "./modes/modes";
import type { Term } from "./vocabulary/terms";

export type Retention = "off" | "24h" | "7d" | "30d" | "forever";
export type InsertMode = "paste" | "type" | "copy";
export type Replacement = { from: string; to: string };

export interface Settings {
  /** Key id as the hotkey source reports it, for example "ControlRight". A single key; a modifier is fine. */
  hotkey: string;
  /** Cancels a toggled recording. */
  cancelKey: string;
  /** "hold": hold to talk, double-tap to lock. "toggle": press to start, press again to finish. */
  mode: "hold" | "toggle";
  /** "auto" or a language code such as "en", "de", "ar". */
  language: string;
  /** Other audio is being ducked, so the recorder must not capture the moments before the press. */
  duck: boolean;
  insertMode: InsertMode;
  /** Insert mode per program, keyed by executable name such as "putty". */
  appModes: Record<string, InsertMode>;
  fillers: boolean;
  spokenSymbols: boolean;
  spokenFormatting: boolean;
  autoCapitalize: boolean;
  trailingSpace: boolean;
  /** Lower-case everything the model heard; words from the vocabulary keep their spelling. */
  lowercase: boolean;
  /** Drop a single full stop at the very end of the dictation. */
  stripFinalStop: boolean;
  replacements: Replacement[];
  retention: Retention;
  /** Shared words and names; every mode sees them. */
  terms: Term[];
  /** Send the words to the speech model as a prompt, within a character budget. */
  prompt: boolean;
  modes: Mode[];
  rewrite: { enabled: boolean; deadlineMs: number };
  /** Keep the audio of each dictation next to its history entry (needs an audio store). */
  keepRecordings: boolean;
}

export const defaultSettings: Readonly<Settings> = {
  hotkey: "ControlRight",
  cancelKey: "Escape",
  mode: "hold",
  language: "auto",
  duck: false,
  insertMode: "paste",
  appModes: {},
  fillers: true,
  spokenSymbols: true,
  spokenFormatting: true,
  autoCapitalize: true,
  trailingSpace: true,
  lowercase: false,
  stripFinalStop: false,
  replacements: [],
  retention: "7d",
  terms: [],
  prompt: true,
  modes: [],
  rewrite: { enabled: false, deadlineMs: 4000 },
  keepRecordings: false,
};
