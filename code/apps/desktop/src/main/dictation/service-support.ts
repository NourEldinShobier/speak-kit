import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DictationState, HistoryEntry, Settings } from "@speakkit/dictation";
import { languageLabel, type SttLanguage } from "@speakkit/engine";
import type { DictationStatus, HistoryItem } from "../../shared/dictation/contract";
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
export const coreSettings = (c: DictationConfig): Partial<Settings> => ({ hotkey: c.hotkey, mode: c.mode, language: c.language, retention: c.retention, replacements: c.replacements });

interface StatusParts {
  supported: boolean;
  config: DictationConfig;
  hotkeyReady: boolean;
  hotkeyFailed: boolean;
  state: DictationState;
  models: ModelManager;
  historyCount: number;
}

/** What the Settings page and the tray are told about dictation. */
export const dictationStatus = ({ supported, config, hotkeyReady, hotkeyFailed, state, models, historyCount }: StatusParts): DictationStatus => ({
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
});

/** The history entries as the page lists them: with the name of the model that heard each one and the language it was told. */
export const historyItems = (entries: readonly HistoryEntry[], catalog: readonly { id: string; name: string }[]): HistoryItem[] =>
  entries.map((e) => {
    const model = e.model ? (catalog.find((m) => m.id === e.model)?.name ?? e.model) : undefined;
    return { id: e.id, at: e.at, text: e.text, ...(e.app && { app: e.app }), ...(model && { model }), ...(e.language && { language: languageLabel(e.language as SttLanguage) }) };
  });

/** Calls `run` at most once per `ms` for updates that arrive often (download progress); `push(true)` runs it now. */
export class Throttle {
  #last = 0;
  #timer: NodeJS.Timeout | undefined;
  readonly #run: () => void;
  readonly #ms: number;

  constructor(run: () => void, ms = 200) {
    this.#run = run;
    this.#ms = ms;
  }

  push(now = false): void {
    if (now || Date.now() - this.#last >= this.#ms) return this.#fire();
    this.#timer ??= setTimeout(() => this.#fire(), this.#ms);
  }

  #fire(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#last = Date.now();
    this.#run();
  }

  dispose(): void {
    clearTimeout(this.#timer);
  }
}

/** A recording is running (held, toggled or locked). */
export const isRecording = (s: { status: string }): boolean => s.status === "recording" || s.status === "locked";
