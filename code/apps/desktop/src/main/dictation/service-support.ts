import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DictationState, Settings } from "@speakkit/dictation";
import type { DictationStatus } from "../../shared/dictation/contract";
import type { DictationConfig } from "../../shared/dictation/settings";
import { firstClash, type Shortcuts } from "../../shared/dictation/conflicts";
import type { DictationConfig as Config } from "../../shared/dictation/settings";
import { hotkeySlots, type DictationPatch } from "../../shared/dictation/settings";
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
  mouseButtons: boolean;
  readerShortcuts: Record<string, string>;
  rejected: DictationStatus["rejected"];
  micOwner: string | undefined;
}

/** Try the hotkey again only when it failed, dictation is on, and the permissions it needs were just allowed. */
export const shouldRetryHotkey = (s: { failed: boolean; enabled: boolean; permitted: boolean }): boolean => s.failed && s.enabled && s.permitted;

/** What the Settings page and the tray are told about dictation. */
export const dictationStatus = ({
  supported,
  config,
  hotkeyReady,
  hotkeyFailed,
  state,
  models,
  historyCount,
  paused,
  readerShortcuts,
  rejected,
  micOwner,
  mouseButtons,
}: StatusParts): DictationStatus => ({
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
  mouseButtons,
  platform: process.platform,
  readerShortcuts,
  ...(rejected && { rejected }),
  ...(micOwner && { micOwner }),
  ...(state.status === "error" && state.owner && { errorOwner: state.owner }),
});

const MAC_MIC_PANE = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

/** The settings page to open for a sound problem: the microphone's privacy switch when the system blocked it, the sound input page otherwise. Null where there is none. */
export function soundSettingsUrl(platform: string, micBlocked: boolean): string | null {
  if (platform === "win32") return micBlocked ? "ms-settings:privacy-microphone" : "ms-settings:sound";
  if (platform === "darwin") return micBlocked ? MAC_MIC_PANE : "x-apple.systempreferences:com.apple.Sound-Settings.extension";
  return null;
}

const SLOT_OF = { hotkey: "dictation", secondHotkey: "second", mouseButton: "mouse", rawHotkey: "raw", pasteLastHotkey: "pasteLast", cancelKey: "cancel" } as const;

/** The first pair of slots that would share a key after `patch`, when the change itself causes it (a clash that was already there is not its fault). */
export function shortcutClash(cfg: Config, patch: DictationPatch, reader: Shortcuts): DictationStatus["rejected"] {
  const touched = (Object.keys(SLOT_OF) as (keyof typeof SLOT_OF)[]).filter((k) => patch[k] !== undefined);
  if (touched.length === 0) return undefined;
  const next = { ...cfg, ...Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined)) } as Config;
  const bad = firstClash({ ...hotkeySlots(next), ...reader });
  if (!bad) return undefined;
  const own = new Set<string>(touched.map((k) => SLOT_OF[k]));
  const [a, b] = bad;
  if (own.has(a)) return { slot: a, with: b };
  return own.has(b) ? { slot: b, with: a } : undefined;
}
