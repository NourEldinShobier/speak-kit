import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DictationState, InsertMode, MicEvent, MicStatus, Settings } from "@speakkit/dictation";
import type { DictationStatus, MicDeviceView, RecorderEvent } from "../../shared/dictation/contract";
import { firstClash, type Shortcuts } from "../../shared/dictation/conflicts";
import { hotkeySlots, type AppRule, type DictationConfig, type DictationPatch } from "../../shared/dictation/settings";
import type { AppOverride } from "./types";
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
const insertModeOf = (method: AppRule["method"]): InsertMode => (method === "type" || method === "copy" ? method : "paste");

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
  keepReady: c.keepReady,
  skipPauses: c.skipPauses,
  keepOnClipboard: c.output === "keep",
  insertMode: c.output === "copy" ? "copy" : "paste",
  returnToApp: c.returnToApp,
  appModes: Object.fromEntries(Object.entries(c.appRules).map(([exe, r]) => [exe, insertModeOf(r.method)])),
  ...c.cleanup,
  terms: c.terms,
  prompt: c.prompt,
  modes: c.modes,
  rewrite: c.rewrite,
  keepRecordings: c.keepRecordings,
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

/** The per-program table as paste rules for the operating system layer: which keys, and how long to wait before them. */
export const appOverrides = (rules: Readonly<Record<string, AppRule>>): AppOverride[] => Object.entries(rules).map(([exe, r]) => ({ exe, profile: { shortcut: r.method, preDelayMs: r.delayMs } }));

/** How long an idle open microphone stays open: nothing when it is released when idle, forever (-1) or for the set number of minutes when kept ready. */
export function keepOpenMs(c: Pick<DictationConfig, "keepReady" | "keepReadyMinutes">): number {
  if (!c.keepReady) return 0;
  return c.keepReadyMinutes === 0 ? -1 : c.keepReadyMinutes * 60_000;
}

/** What the microphone window reported, as an event of the microphone status; the device list is not one. */
export function micEventOf(e: RecorderEvent): MicEvent | undefined {
  switch (e.type) {
    case "silent":
      return { type: "silent" };
    case "lost":
      return { type: "reopening", attempt: 1 };
    case "gave-up":
      return { type: "gave-up" };
    case "reopening":
      return { type: "reopening", attempt: e.attempt };
    case "opened":
      return { type: "chosen", label: e.label, bluetooth: e.bluetooth };
    case "no-device":
      return { type: "no-device", builtInOff: e.builtInOff };
    case "devices":
      return undefined;
  }
}

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
  mic: MicStatus;
  devices: MicDeviceView[];
  notes: HistoryNotes;
}

/** What the History page is told beyond the entries: the file notices, recordings, the rewrite key and the word-list note. */
interface HistoryNotes {
  historyStatus: DictationStatus["historyStatus"];
  historyCopy?: string | undefined;
  historyRev: number;
  keptRecordings: number;
  rewriteKey: boolean;
  promptDropped: boolean;
  redo: DictationStatus["redo"];
}

const historyNotes = ({ historyCopy, promptDropped, redo, ...rest }: HistoryNotes) => ({
  ...rest,
  ...(historyCopy && { historyCopy }),
  ...(promptDropped && { promptDropped: true }),
  ...(redo && { redo }),
});

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
  mic,
  devices,
  notes,
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
  mic,
  devices,
  ...historyNotes(notes),
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
export function shortcutClash(cfg: DictationConfig, patch: DictationPatch, reader: Shortcuts): DictationStatus["rejected"] {
  const touched = (Object.keys(SLOT_OF) as (keyof typeof SLOT_OF)[]).filter((k) => patch[k] !== undefined);
  if (touched.length === 0) return undefined;
  const next = { ...cfg, ...Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined)) } as DictationConfig;
  const bad = firstClash({ ...hotkeySlots(next), ...reader });
  if (!bad) return undefined;
  const own = new Set<string>(touched.map((k) => SLOT_OF[k]));
  const [a, b] = bad;
  if (own.has(a)) return { slot: a, with: b };
  return own.has(b) ? { slot: b, with: a } : undefined;
}

const MIC_KEYS = ["keepReady", "keepReadyMinutes", "microphone", "micExclusions", "avoidBluetooth"] as const;

/** True when a settings change needs the microphone window told (which input, and whether it stays open). */
export const touchesMicrophone = (patch: object): boolean => MIC_KEYS.some((k) => k in patch);

/** The app window is on screen: not hidden to the tray, not minimized, not gone. */
export const windowShown = (w: { isDestroyed(): boolean; isVisible(): boolean; isMinimized(): boolean } | null): boolean => !!w && !w.isDestroyed() && w.isVisible() && !w.isMinimized();

/** A recording is running (held, toggled or locked). */
export const isRecording = (s: { status: string }): boolean => s.status === "recording" || s.status === "locked";
