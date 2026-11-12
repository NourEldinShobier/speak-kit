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
  replacements: Replacement[];
  retention: Retention;
}

export const defaultSettings: Readonly<Settings> = {
  hotkey: "ControlRight",
  cancelKey: "Escape",
  mode: "hold",
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
  replacements: [],
  retention: "7d",
};
