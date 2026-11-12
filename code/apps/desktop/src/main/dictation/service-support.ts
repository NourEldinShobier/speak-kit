import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DictationState, Settings } from "@speakkit/dictation";
import type { DictationStatus } from "../../shared/dictation/contract";
import type { DictationConfig } from "../../shared/dictation/settings";
import type { ModelManager } from "./models";
import type { HotkeyLayout } from "./hotkey-source";

/** The speech worker is the built file (packaged) or the source file in the engine package (development), like the voice worker. */
export async function sttWorkerUrl(distDir: string): Promise<URL> {
  const built = path.join(distDir, "../worker/stt-worker.js");
  return access(built).then(
    () => pathToFileURL(built),
    () => new URL("./stt/worker.ts", import.meta.resolve("@speakkit/engine")),
  );
}

export const clock = {
  now: () => Date.now(),
  after(ms: number, fn: () => void) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};
export const coreSettings = (c: DictationConfig): Partial<Settings> => ({
  hotkey: c.hotkey,
  mode: c.mode,
  holdMs: c.holdMs,
  secondKey: c.secondHotkey,
  mouseKey: c.mouseButton,
  rawKey: c.rawHotkey,
  pasteLastKey: c.pasteLastHotkey,
  cancelKey: c.cancelKey,
  language: c.language,
  retention: c.retention,
  replacements: c.replacements,
});

/** What the key hook listens for. Sharing the keys with other programs is only offered in Hold mode, because a hands-free mode cannot keep the other program's key held. */
export const hotkeyLayout = (c: DictationConfig): HotkeyLayout => ({
  hotkey: c.hotkey,
  second: c.secondHotkey,
  mouse: c.mouseButton,
  raw: c.rawHotkey,
  pasteLast: c.pasteLastHotkey,
  cancelKey: c.cancelKey,
  share: c.shareHotkey && c.mode === "hold-only",
});

interface StatusParts {
  supported: boolean;
  config: DictationConfig;
  hotkeyReady: boolean;
  hotkeyFailed: boolean;
  state: DictationState;
  models: ModelManager;
  historyCount: number;
  paused: boolean;
  readerShortcuts: Record<string, string>;
  rejected: DictationStatus["rejected"];
  micOwner: string | undefined;
}

/** What the Settings page and the tray are told about dictation. */
export const dictationStatus = ({ supported, config, hotkeyReady, hotkeyFailed, state, models, historyCount, paused, readerShortcuts, rejected, micOwner }: StatusParts): DictationStatus => ({
  supported,
  enabled: config.enabled,
  hotkeyReady,
  ...(hotkeyFailed && { hotkeyFailed: true }),
  phase: state.status,
  ...(state.status === "error" && { error: state.code }),
  settings: config,
  models: models.views(),
  modelInstalled: models.installed,
  modelReady: models.ready,
  ...(models.error && { modelError: models.error }),
  historyCount,
  paused,
  readerShortcuts,
  ...(rejected && { rejected }),
  ...(micOwner && { micOwner }),
  ...(state.status === "error" && state.owner && { errorOwner: state.owner }),
});
