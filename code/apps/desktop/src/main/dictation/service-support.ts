import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DictationState, Settings } from "@speakkit/dictation";
import type { DictationStatus } from "../../shared/dictation/contract";
import type { DictationConfig } from "../../shared/dictation/settings";
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
export const coreSettings = (c: DictationConfig): Partial<Settings> => ({
  hotkey: c.hotkey,
  mode: c.mode,
  language: c.language,
  retention: c.retention,
  replacements: c.replacements,
  ...c.cleanup,
  terms: c.terms,
  prompt: c.prompt,
  modes: c.modes,
  rewrite: c.rewrite,
  keepRecordings: c.keepRecordings,
});

interface StatusParts {
  supported: boolean;
  config: DictationConfig;
  hotkeyReady: boolean;
  hotkeyFailed: boolean;
  state: DictationState;
  models: ModelManager;
  historyCount: number;
  historyStatus: DictationStatus["historyStatus"];
  keptRecordings: number;
  rewriteKey: boolean;
  promptDropped: boolean;
  redo: DictationStatus["redo"];
}

/** What the Settings page and the tray are told about dictation. */
export const dictationStatus = ({ supported, config, hotkeyReady, hotkeyFailed, state, models, historyCount, historyStatus, keptRecordings, rewriteKey, promptDropped, redo }: StatusParts): DictationStatus => ({
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
  historyStatus,
  keptRecordings,
  rewriteKey,
  ...(promptDropped && { promptDropped: true }),
  ...(redo && { redo }),
});
