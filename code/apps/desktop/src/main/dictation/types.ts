/** Windows virtual-key code of one physical key (macOS key codes are translated to these, so hotkeys are stored the same on both). Left and right modifiers are separate codes (VK.rightCtrl, not VK.ctrl). */
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
  leftButton: 0x01,
} as const;

/** Home, End, Page Up and Page Down arrive with the same codes as the numpad keys when Num Lock is off; the extended flag tells them apart. The hook reports the dedicated keys as the code plus this offset. */
export const EXTENDED = 0x100;

/** All keys must be down together; the one pressed last completes the chord and is the one swallowed. */
export interface Chord {
  keys: readonly VirtualKey[];
  /** Let the keys reach the app too (sharing the shortcut with another program that listens for it). */
  share?: boolean;
}

export type HotkeyEvent = (
  | { kind: "down" }
  | { kind: "up" }
  /** Another key (or a mouse click) went down while the chord was complete, or right after it was released. The app still gets it. */
  | { kind: "other"; vk: VirtualKey }
  /** A key given to `grab` went down; it was swallowed. */
  | { kind: "grabbed"; vk: VirtualKey }
) & {
  /** Which chord it is about; absent for the primary one. */
  chord?: string;
};

export type HotkeyStart = { ok: true } | { ok: false; reason: "unsupported-platform" | "hook-failed" | "already-running" };

/** Keys whose release would open a menu or the Start menu in the app in front when nothing else was pressed with them. */
export const MENU_KEYS: ReadonlySet<VirtualKey> = new Set([VK.leftAlt, VK.rightAlt, VK.leftWin, VK.rightWin]);

export interface HotkeyHandlers {
  /** Called from the event loop, never from inside the hook callback, so it may take as long as it needs. */
  onEvent(event: HotkeyEvent): void;
  /** The hook was removed because its callback threw; keys have been passing through unchanged since. */
  onFault?(error: unknown): void;
}

export interface HotkeySource {
  readonly active: boolean;
  /** More chords next to the primary one, by name; their events carry the name in `chord`. Replaces the earlier set and takes effect at once, also while running. */
  setExtraChords?(chords: Readonly<Record<string, Chord>>): void;
  /** True while any key or mouse button is physically down (the keyboard state, not what the hook saw). */
  anyKeyDown?(): boolean;
  /** The mouse hook is needed for mouse buttons in a chord and for clicks that end a hold. Absent where the platform has none. */
  readonly mouse?: boolean;
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
  /** Keyboard layout of the window as a language code ("de", "en"); absent where the platform cannot tell. */
  layout?: string;
  /** True when the window's program runs with higher rights than this app (Windows then drops our key presses). */
  elevated: boolean;
  /** Product version of the program when it is a browser built on Chromium and the version could be read, e.g. "155.0.7000.1". */
  version?: string;
  /** Where the window is on the screen; used to tell a full-screen program. */
  bounds?: { x: number; y: number; width: number; height: number };
}

/** The key combination that pastes. */
export type PasteKey = "ctrl-v" | "ctrl-shift-v" | "shift-insert";

/** How text reaches the focused field. */
export interface PasteProfile {
  shortcut: PasteKey | "type" | "copy";
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

/** How typing ended: all of it, a key the system refused, or the person stopped it. */
export type TypeResult = "done" | "rejected" | "stopped";

export type CopyReason = "copy-only" | "elevated-target" | "foreground-changed" | "keys-rejected" | "modifiers-held" | "no-foreground" | "secure-input" | "typing-stopped" | "unsupported-platform";

export type InsertResult =
  /** The keys were accepted by Windows. The target app may still ignore them; nothing can confirm it did not. */
  | { status: "pasted" | "typed" }
  /** Nothing was pasted; the text is on the clipboard for the user to paste. */
  | { status: "copied"; reason: CopyReason }
  /** A password field has focus: nothing was typed, pasted or copied. */
  | { status: "refused"; reason: "password-field" }
  /** Another program holds the clipboard, so the text could not even be copied. */
  | { status: "failed"; reason: "clipboard-unavailable" };

/**
 * Clipboard formats that tell clipboard history, cloud sync and clipboard monitors to leave the content alone. Dictated text carries them, and a
 * clipboard that had them (a password manager's copy) gets them back when it is restored.
 */
export const CLIPBOARD_PRIVACY_MARKS = ["CanIncludeInClipboardHistory", "CanUploadToCloudClipboard", "ExcludeClipboardContentFromMonitorProcessing"] as const;

/** What the paste path needs from the operating system. */
export interface InputPort {
  /** `layout: false` lets a platform skip a costly keyboard layout reading nobody will use. */
  foreground(want?: { layout: boolean }): ForegroundInfo | null;
  /** True when the focused control is a password field this platform can recognise. */
  passwordFocused(): boolean;
  /** True while the system blocks synthesized keys for secure input (macOS password fields and secure keyboard entry): the text is only copied. Absent where there is no such state. */
  secureInput?(): boolean;
  /** Names of the Shift, Alt and Win keys that are down right now. */
  heldModifiers(): string[];
  /** Presses the paste keys as scan codes. False when the system did not accept every key; keys already pressed are released again. */
  pressPaste(key: PasteKey): boolean;
  /** Brings a window to the front and says whether it is in front within half a second. */
  focus(hwnd: string): Promise<boolean>;
  /**
   * Types the text as Unicode key events without touching the clipboard, in pieces; a line break is Shift+Enter, so a chat box that sends on Enter gets a
   * new line instead. `stopped` is asked between pieces: when it says true typing ends there ("stopped"). "rejected": the system did not accept every key.
   */
  type(text: string, stopped?: () => boolean): Promise<TypeResult>;
  /** Changes whenever any program writes the clipboard. */
  clipboardSequence(): number;
  /** What the clipboard holds now: `files` (a file list, which a copy through Electron cannot keep), how many `formats` it has, and which privacy marks its owner put on it. */
  clipboardTraits(): { files: boolean; formats: number; marks: readonly string[] };
  /** Adds privacy marks to the content now on the clipboard. False when the clipboard could not be opened. */
  markClipboard(marks: readonly string[]): Promise<boolean>;
}

export interface DictationPlatform {
  readonly supported: boolean;
  readonly hotkey: HotkeySource;
  readonly input: InputPort;
  dispose(): void;
}
