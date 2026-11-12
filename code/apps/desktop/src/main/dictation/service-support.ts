import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DictationState, InsertMode, MicEvent, MicStatus, Settings } from "@speakkit/dictation";
import type { DictationStatus, MicDeviceView, RecorderEvent } from "../../shared/dictation/contract";
import type { AppRule, DictationConfig } from "../../shared/dictation/settings";
import type { AppOverride } from "./types";
import type { ModelManager } from "./models";

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
  language: c.language,
  retention: c.retention,
  replacements: c.replacements,
  keepReady: c.keepReady,
  keepOnClipboard: c.output === "keep",
  insertMode: c.output === "copy" ? "copy" : "paste",
  returnToApp: c.returnToApp,
  appModes: Object.fromEntries(Object.entries(c.appRules).map(([exe, r]) => [exe, insertModeOf(r.method)])),
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
  mic: MicStatus;
  devices: MicDeviceView[];
}

/** What the Settings page and the tray are told about dictation. */
export const dictationStatus = ({ supported, config, hotkeyReady, hotkeyFailed, state, models, historyCount, mic, devices }: StatusParts): DictationStatus => ({
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
  mic,
  devices,
});
