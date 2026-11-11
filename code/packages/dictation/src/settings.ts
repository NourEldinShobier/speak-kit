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
  /** Ctrl+Shift+V in terminals. */
  terminalPaste: boolean;
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
  insertMode: "paste",
  terminalPaste: true,
  appModes: {},
  fillers: true,
  spokenSymbols: true,
  spokenFormatting: true,
  autoCapitalize: true,
  trailingSpace: true,
  replacements: [],
  retention: "7d",
};
