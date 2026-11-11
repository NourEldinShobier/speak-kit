/** Windows virtual-key code of one physical key. Left and right modifiers are separate codes (VK.rightCtrl, not VK.ctrl). */
export type VirtualKey = number;

/** Common keys for chords. The low-level hook reports the left and right modifier codes, never the generic ones. */
export const VK = {
  escape: 0x1b,
  space: 0x20,
  v: 0x56,
  leftShift: 0xa0,
  rightShift: 0xa1,
  leftCtrl: 0xa2,
  rightCtrl: 0xa3,
  leftAlt: 0xa4,
  rightAlt: 0xa5,
  leftWin: 0x5b,
  rightWin: 0x5c,
  capsLock: 0x14,
} as const;

/** All keys must be down together; the one pressed last completes the chord and is the one swallowed. */
export interface Chord {
  keys: readonly VirtualKey[];
}

export type HotkeyEvent =
  /** The chord was completed. */
  | { kind: "down" }
  /** A chord key was released after "down" (also sent when the key was found stuck: it was up while the hook never saw the release). */
  | { kind: "up" }
  /** Another key went down while the chord was complete. The app still gets it. */
  | { kind: "other"; vk: VirtualKey }
  /** A key given to `grab` went down; it was swallowed. */
  | { kind: "grabbed"; vk: VirtualKey };

export type HotkeyStart = { ok: true } | { ok: false; reason: "unsupported-platform" | "hook-failed" | "already-running" };

export interface HotkeyHandlers {
  /** Called from the event loop, never from inside the hook callback, so it may take as long as it needs. */
  onEvent(event: HotkeyEvent): void;
  /** The hook was removed because its callback threw; keys have been passing through unchanged since. */
  onFault?(error: unknown): void;
}

export interface HotkeySource {
  readonly active: boolean;
  start(chord: Chord, handlers: HotkeyHandlers): HotkeyStart;
  stop(): void;
  /** Swallows these keys (and reports them as "grabbed") until the list is replaced; an empty list releases them. Used for Escape while a toggled recording runs. */
  grab(keys: readonly VirtualKey[]): void;
  /** Forgets keys believed down. Call after a screen lock or unlock or a resume from sleep, when key releases may have gone to another desktop; reports "up" if the chord was down. */
  resync(): void;
}

export interface ForegroundInfo {
  /** Window handle as a string, to compare windows and hand back to `insert`. */
  hwnd: string;
  pid: number;
  /** File name of the program, e.g. "WindowsTerminal.exe"; null when the process could not be opened. */
  exe: string | null;
  className: string;
  /** True when the window's program runs with higher rights than this app (Windows then drops our key presses). */
  elevated: boolean;
}

/** How text reaches the focused field. */
export interface PasteProfile {
  shortcut: "ctrl-v" | "ctrl-shift-v" | "type" | "copy";
  /** Wait before the keys, for apps that need time to see the clipboard (remote desktop). */
  preDelayMs: number;
  /** How long the new clipboard text stays before the old clipboard comes back. */
  restoreDelayMs: number;
}

/** A rule for one program: `exe` is the file name without ".exe", any case. */
export interface AppOverride {
  exe: string;
  profile: Partial<PasteProfile>;
}

export interface InsertOptions {
  /** `hwnd` from `foreground()` when the key was pressed. A different foreground window at insert time means the text is only copied. */
  target?: string;
  /** "paste" (default) puts the old clipboard back; "keep" leaves the text on the clipboard after pasting; "copy" only copies; "type" types it as key events. */
  mode?: "paste" | "keep" | "copy" | "type";
}

export type CopyReason = "copy-only" | "elevated-target" | "foreground-changed" | "keys-rejected" | "modifiers-held" | "no-foreground" | "unsupported-platform";

export type InsertResult =
  /** The keys were accepted by Windows. The target app may still ignore them; nothing can confirm it did not. */
  | { status: "pasted" | "typed" }
  /** Nothing was pasted; the text is on the clipboard for the user to paste. */
  | { status: "copied"; reason: CopyReason }
  /** A password field has focus: nothing was typed, pasted or copied. */
  | { status: "refused"; reason: "password-field" }
  /** Another program holds the clipboard, so the text could not even be copied. */
  | { status: "failed"; reason: "clipboard-unavailable" };

/** What the paste path needs from the operating system. */
export interface InputPort {
  foreground(): ForegroundInfo | null;
  /** True when the focused control is a password field this platform can recognise. */
  passwordFocused(): boolean;
  /** Names of the Shift, Alt and Win keys that are down right now. */
  heldModifiers(): string[];
  /** Presses Ctrl+V (with Shift when asked) as scan codes. False when the system did not accept every key; keys already pressed are released again. */
  pressPaste(withShift: boolean): boolean;
  /** Types the text as Unicode key events without touching the clipboard. False when the system did not accept every key. */
  type(text: string): boolean;
  /** Changes whenever any program writes the clipboard. */
  clipboardSequence(): number;
}

export interface DictationPlatform {
  readonly supported: boolean;
  readonly hotkey: HotkeySource;
  readonly input: InputPort;
  dispose(): void;
}
