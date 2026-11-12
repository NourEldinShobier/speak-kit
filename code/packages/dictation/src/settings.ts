export type Retention = "off" | "24h" | "7d" | "30d" | "forever";
export type InsertMode = "paste" | "type" | "copy";
export type Mode = "hold" | "hold-only" | "toggle" | "double-tap" | "tap-or-hold";
export type Replacement = { from: string; to: string };

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
  holdMs: 300,
  secondKey: "",
  mouseKey: "",
  rawKey: "",
  pasteLastKey: "",
  language: "auto",
  duck: false,
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
