import { createElectronClipboard } from "./clipboard";
import { createHud, type Hud } from "./hud";
import { openHudWindow, type HudWindowOptions } from "./hud-window";
import { createInserter } from "./inserter";
import { createUnsupportedPlatform } from "./unsupported";
import type { AppOverride, ForegroundInfo, HotkeySource, InsertOptions, InsertResult } from "./types";

export { VK } from "./types";
export type { AppOverride, Chord, CopyReason, ForegroundInfo, HotkeyEvent, HotkeyHandlers, HotkeySource, HotkeyStart, InsertOptions, InsertResult, PasteProfile, VirtualKey } from "./types";
export type { Hud, HudState } from "./hud";

export interface DictationOsOptions {
  /** Per-program paste rules on top of the built-in ones (terminals, Java, remote desktop). */
  overrides?: readonly AppOverride[];
  hud?: HudWindowOptions & { idleMs?: number };
}

/** Everything dictation needs from the operating system, behind one object. */
export interface DictationOs {
  /** False where key hook and key injection are not implemented yet: the hotkey will not start and `insert` only copies. */
  readonly supported: boolean;
  readonly hotkey: HotkeySource;
  readonly hud: Hud;
  /** The window the user is typing into. Call it when the dictation key goes down and pass its `hwnd` to `insert` as `target`. */
  foreground(): ForegroundInfo | null;
  /** Gets text into the focused field of the foreground program. Calls are queued, so dictations paste in the order they finish. */
  insert(text: string, options?: InsertOptions): Promise<InsertResult>;
  /** Resolves once the user's old clipboard is back after a paste. */
  settled(): Promise<void>;
  /** Stops the hotkey, puts the clipboard back at once and destroys the HUD window. */
  dispose(): Promise<void>;
}

export async function createDictationOs(options: DictationOsOptions = {}): Promise<DictationOs> {
  const platform = process.platform === "win32" ? await (await import("./windows")).createWindowsPlatform() : createUnsupportedPlatform();
  const inserter = createInserter({
    input: platform.input,
    clip: createElectronClipboard(platform.input.clipboardSequence),
    overrides: options.overrides,
    supported: platform.supported,
  });
  const hud = createHud({ open: () => openHudWindow(options.hud), idleMs: options.hud?.idleMs });
  return {
    supported: platform.supported,
    hotkey: platform.hotkey,
    hud,
    foreground: () => platform.input.foreground(),
    insert: (text, opts) => inserter.insert(text, opts),
    settled: () => inserter.settled(),
    async dispose() {
      platform.dispose();
      hud.dispose();
      await inserter.flush();
    },
  };
}
