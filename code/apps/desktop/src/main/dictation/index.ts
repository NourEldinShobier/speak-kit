import { systemCaretReader, type CaretReader } from "./caret-reader";
import { createElectronClipboard } from "./clipboard";
import { createHud, type Hud, type HudWindow } from "./hud";
import { openHudWindow, type HudWindowOptions } from "./hud-window";
import { createProgramVersions, readSystemVersion, type ProgramVersions } from "./program-version";
import { createInserter } from "./inserter";
import { createUnsupportedPlatform } from "./unsupported";
import type { AppOverride, ForegroundInfo, HotkeySource, InsertOptions, InsertResult } from "./types";

export { VK } from "./types";
export type { AppOverride, Chord, CopyReason, ForegroundInfo, HotkeyEvent, HotkeyHandlers, HotkeySource, HotkeyStart, InsertOptions, InsertResult, PasteProfile, VirtualKey } from "./types";
export type { Hud, HudState, HudWindow } from "./hud";

export interface DictationOsOptions {
  /** Per-program paste rules on top of the built-in ones (terminals, Java, remote desktop). */
  overrides?: readonly AppOverride[] | (() => readonly AppOverride[]);
  hud?: HudWindowOptions & { idleMs?: number; place?: () => "top" | "bottom" };
  /** Called with each HUD window as it is created, so the app can tell which page its HUD buttons come from. */
  onHudWindow?(w: HudWindow): void;
  /** The version lookup for browsers; replaced in tests. */
  versions?: ProgramVersions;
  /** Typing started or ended. */
  onTyping?(on: boolean): void;
}

/** Everything dictation needs from the operating system, behind one object. */
export interface DictationOs {
  /** False where key hook and key injection are not implemented (Linux): the hotkey will not start and `insert` only copies. */
  readonly supported: boolean;
  readonly hotkey: HotkeySource;
  readonly hud: Hud;
  /** The window the user is typing into. Call it when the dictation key goes down and pass its `hwnd` to `insert` as `target`. */
  foreground(): ForegroundInfo | null;
  /** True when the focused control is a password field. */
  passwordFocused(): boolean;
  /** Gets text into the focused field of the foreground program. Calls are queued, so dictations paste in the order they finish. */
  insert(text: string, options?: InsertOptions): Promise<InsertResult>;
  /** The character before the caret in the focused field, for smart spacing. Absent on an OS layer that cannot read it. */
  readonly caret?: CaretReader;
  /** Brings a window (by the `hwnd` of `foreground()`) to the front; true when it is in front within half a second. */
  focus(hwnd: string): Promise<boolean>;
  /** Resolves once the user's old clipboard is back after a paste. */
  settled(): Promise<void>;
  /** Ends typing in progress after the piece being sent; the text stays on the clipboard. */
  cancelTyping(): void;
  /** Stops the hotkey, puts the clipboard back at once and destroys the HUD window. */
  dispose(): Promise<void>;
}

/** Each OS implementation is imported only on its own platform, so a build never loads the other one's native bindings. */
async function loadPlatform() {
  if (process.platform === "win32") return (await import("./windows")).createWindowsPlatform();
  if (process.platform === "darwin") return (await import("./macos")).createMacPlatform();
  return createUnsupportedPlatform();
}

export async function createDictationOs(options: DictationOsOptions = {}): Promise<DictationOs> {
  const platform = await loadPlatform();
  const versions = options.versions ?? createProgramVersions((fg) => readSystemVersion(fg));
  const inserter = createInserter({
    versions,
    input: platform.input,
    clip: createElectronClipboard(platform.input),
    overrides: options.overrides,
    supported: platform.supported,
    onTyping: options.onTyping,
  });
  const hud = createHud({
    open: () => {
      const w = openHudWindow(options.hud);
      options.onHudWindow?.(w);
      return w;
    },
    idleMs: options.hud?.idleMs,
    ...(options.hud?.place && { place: options.hud.place }),
  });
  const caret = systemCaretReader();
  return {
    caret,
    supported: platform.supported,
    hotkey: platform.hotkey,
    hud,
    foreground: () => {
      const fg = platform.input.foreground();
      versions.warm(fg); // read while the person talks, so the paste does not wait for it
      return fg;
    },
    passwordFocused: () => platform.input.passwordFocused(),
    insert: (text, opts) => inserter.insert(text, opts),
    focus: (hwnd) => platform.input.focus(hwnd),
    settled: () => inserter.settled(),
    cancelTyping: () => inserter.cancelTyping(),
    async dispose() {
      platform.dispose();
      caret.dispose();
      hud.dispose();
      await inserter.flush();
    },
  };
}
