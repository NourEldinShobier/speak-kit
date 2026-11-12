import { powerSaveBlocker } from "electron";
import type { Dictation, DictationState } from "@speakkit/dictation";
import { soundFor, tonesFor } from "../../shared/dictation/sounds";
import type { DictationConfig } from "../../shared/dictation/settings";
import type { SwitchableHotkeys } from "./hotkey-source";
import type { ModelManager } from "./models";
import { createSleepBlock } from "./sleep-block";
import type { RecorderHost } from "./recorder";
import type { Failure } from "./service-actions";
import type { HudPresenter } from "./hud-presenter";
import type { DictationOs } from "./index";
import { restoreTakes } from "./restore-takes";
import type { Spool } from "./spool";
import type { SpooledRecorder } from "./spooled-recorder";
import { runTransform, transformToast } from "./transform-run";

/** Takes the last session left on disk go through dictation and end up copied and in the history; the person is told how many. Never rejects. */
export async function recoverTakes(o: { spool: { spool: Spool; spooled: SpooledRecorder }; core: Dictation; presenter: HudPresenter; warn(title: string, detail: string): void }): Promise<void> {
  const { spool, core, presenter, warn } = o;
  try {
    const n = await restoreTakes(spool.spool, spool.spooled, core);
    if (n > 0) presenter.toast(n === 1 ? "Recovered a recording from the last session" : `Recovered ${n} recordings from the last session`);
  } catch (e) {
    warn("dictation recovery failed", String(e));
  }
}

/** The clean-up shortcut: cleans the focused field and says what happened. Only while dictation is on and the shortcut is set. */
export async function cleanField(os: DictationOs | undefined, cfg: DictationConfig, presenter: HudPresenter): Promise<void> {
  if (!os || !cfg.enabled || !cfg.transformHotkey) return;
  const toast = transformToast(await runTransform(os, cfg));
  presenter.toast(toast.text, toast.tone);
}

/** Runs `recoverTakes` once per launch, at the first start with dictation on. */
export function createRecovery(h: { spool: { spool: Spool; spooled: SpooledRecorder }; core(): Dictation | undefined; presenter: HudPresenter; warn(title: string, detail: string): void }) {
  let done = false;
  return () => {
    const core = h.core();
    if (done || !core) return;
    done = true;
    void recoverTakes({ spool: h.spool, core, presenter: h.presenter, warn: h.warn });
  };
}

/** What a change of the dictation state sets off outside the pill: a tone, the cancel key's grab, and the last failure the page keeps. */
export function onStateChange(h: {
  prev: DictationState;
  next: DictationState;
  cfg: DictationConfig;
  failure: Failure;
  recorder: RecorderHost | undefined;
  hotkeys: SwitchableHotkeys | undefined;
  now: number;
}): void {
  const { next, failure } = h;
  const kind = soundFor(h.prev, next);
  if (kind) h.recorder?.tone(tonesFor(kind, h.cfg.sounds));
  // Escape cancels a toggled recording, and typing that is going in; in a held or locked recording it belongs to the app in front.
  h.hotkeys?.setCancelGrab((next.status === "recording" && next.mode === "toggle") || next.status === "pasting");
  if (next.status === "error") {
    failure.error = next.code;
    failure.last = { code: next.code, at: h.now, ...(next.owner && { owner: next.owner }) };
  } else if (next.status === "idle" && (next.notice?.kind === "inserted" || next.notice?.kind === "copied")) failure.last = undefined;
}

/** After the key hook starts: warm the model, or fetch it when it is missing. At launch (quiet) with release-when-idle on, the model stays on disk and the first dictation loads it (the page says that takes longer). */
export function prepareModel(models: ModelManager, o: { quiet: boolean; idleMinutes: number; skipped: boolean; model: DictationConfig["model"] }): void {
  if (models.installed) {
    if (!o.quiet || o.idleMinutes === 0) models.warm();
  } else if (!o.skipped) void models.download(o.model);
}

/** Keeps the computer awake while a recording runs, when the setting is on; a failure is logged and the recording goes on. */
export const sleepBlock = (enabled: () => boolean, warn: (why: string) => void) => createSleepBlock(powerSaveBlocker, enabled, warn);

/** Starts the helper that reads the character before the caret ahead of the first dictation, when smart spacing is on. */
export const warmCaret = (os: DictationOs | undefined, cfg: Pick<DictationConfig, "smartSpacing">): void => {
  if (cfg.smartSpacing) os?.caret?.warm();
};
