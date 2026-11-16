import type { Mode as WritingMode } from "./modes/modes";
import type { Term } from "./vocabulary/terms";

export type Retention = "off" | "24h" | "7d" | "30d" | "forever";
export type InsertMode = "paste" | "type" | "copy";
export type Mode = "hold" | "hold-only" | "toggle" | "double-tap" | "tap-or-hold";
/** `matchCase`: only the exact capitals match; without it capital letters are ignored. */
export type Replacement = { from: string; to: string; matchCase?: boolean | undefined };

export interface Settings {
  /** Key id as the hotkey source reports it, for example "ControlRight". A single key; a modifier is fine. */
  hotkey: string;
  /** Cancels a toggled recording. */
  cancelKey: string;
  /**
   * "hold": hold to talk, double-tap to lock. "hold-only": hold to talk. "toggle": press to start, press again to finish.
   * "double-tap": only a double-tap starts a (locked) recording. "tap-or-hold": a long hold dictates until release, a short tap toggles.
   */
  mode: Mode;
  /** A press shorter than this is a tap: nothing is kept. */
  holdMs: number;
  /** Second shortcut for the same job, for a laptop and an external keyboard; "" is unset. */
  secondKey: string;
  /** A mouse button (Mouse2 to Mouse5) that dictates like the main shortcut; "" is unset. */
  mouseKey: string;
  /** Dictates with text clean-up and replacements off; "" is unset. */
  rawKey: string;
  /** Types the last dictation again; "" is unset. Handled by the app, which owns the key hook. */
  pasteLastKey: string;
  /** "auto" or a language code such as "en", "de", "ar". */
  language: string;
  /** Other audio is being ducked, so the recorder must not capture the moments before the press. */
  duck: boolean;
  /** Before decoding, drops the middle of long pauses (speeds up slow computers; falls back to the whole recording when nothing is heard). */
  skipPauses: boolean;
  /** The microphone stays open between recordings, which gives pre-roll; off means it is released when idle. */
  keepReady: boolean;
  /** Paste leaves the dictated text on the clipboard instead of putting the old content back. */
  keepOnClipboard: boolean;
  /** At output time, bring the window the key was pressed in back to the front; paste nothing when that fails. */
  returnToApp: boolean;
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
  modes: WritingMode[];
  rewrite: { enabled: boolean; deadlineMs: number };
  /** Adds a space before the text when the character before the caret is a letter, digit or closing punctuation. */
  smartSpacing: boolean;
  /** Keep the audio of each dictation next to its history entry (needs an audio store). */
  keepRecordings: boolean;
}

export const defaultSettings: Readonly<Settings> = {
  hotkey: "ControlRight",
  cancelKey: "Escape",
  mode: "hold",
  holdMs: 300,
  secondKey: "",
  mouseKey: "",
  rawKey: "",
  pasteLastKey: "",
  language: "auto",
  duck: false,
  skipPauses: false,
  keepReady: false,
  keepOnClipboard: false,
  returnToApp: true,
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
  smartSpacing: false,
  keepRecordings: false,
};
