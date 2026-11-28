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
import { at } from "../../shared/i18n";
import "../../shared/i18n/packs/main";

/** Takes the last session left on disk go through dictation and end up copied and in the history; the person is told how many. Never rejects. */
export async function recoverTakes(o: { spool: { spool: Spool; spooled: SpooledRecorder }; core: Dictation; presenter: HudPresenter; warn(title: string, detail: string): void }): Promise<void> {
  const { spool, core, presenter, warn } = o;
  try {
    const n = await restoreTakes(spool.spool, spool.spooled, core);
    if (n > 0) presenter.toast(at("hud.recovered", { n }));
  } catch (e) {
    warn("dictation recovery failed", String(e));
  }
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

/** Escape is taken from the program in front only when it cancels something: a toggled or locked recording, a rewrite that can be skipped, or typing that is going in (a paste cannot be stopped, so Escape stays with the app). */
export const cancelGrab = (s: DictationState, typing: boolean): boolean =>
  (s.status === "recording" && s.mode === "toggle") || s.status === "locked" || (s.status === "transcribing" && !!s.rewriting) || (s.status === "pasting" && typing);

/** What a change of the dictation state sets off outside the pill: a tone, the cancel key's grab, and the last failure the page keeps. */
export function onStateChange(h: {
  prev: DictationState;
  next: DictationState;
  cfg: DictationConfig;
  failure: Failure;
  recorder: RecorderHost | undefined;
  hotkeys: SwitchableHotkeys | undefined;
  /** Keys are being typed into the program in front. */
  typing: boolean;
  now: number;
}): void {
  const { next, failure } = h;
  const kind = soundFor(h.prev, next);
  if (kind) h.recorder?.tone(tonesFor(kind, h.cfg.sounds));
  // Escape cancels a toggled or locked recording, skips a rewrite, and stops typing that is going in; in a held recording it belongs to the app in front.
  h.hotkeys?.setCancelGrab(cancelGrab(next, h.typing));
  if (next.status === "error") {
    failure.error = next.code;
    failure.last = { code: next.code, at: h.now, ...(next.owner && { owner: next.owner }) };
  } else if (next.status === "idle" && (next.notice?.kind === "inserted" || next.notice?.kind === "copied")) failure.last = undefined;
}

/** After the key hook starts: warm an installed model; resolves when that load is over. A missing one is not fetched: the page asks the person to choose and download one. At launch (quiet) with release-when-idle on, the model stays on disk and the first dictation loads it. */
export function prepareModel(models: ModelManager, o: { quiet: boolean; idleMinutes: number }): Promise<void> {
  return models.installed && (!o.quiet || o.idleMinutes === 0) ? models.warm() : Promise.resolve();
}

type WriterChoice = Pick<DictationConfig, "rewrite" | "rewriteWriter">;
const wantsLocalWriter = (cfg: WriterChoice): boolean => cfg.rewrite.enabled && cfg.rewriteWriter === "local";

/** Loads the rewrite pass's writer ahead of the dictation that needs it: only when the pass is on and set to run on this computer. A model that is not downloaded stays unloaded. */
export const warmWriter = (writer: { warm(): Promise<void> }, cfg: WriterChoice): void => {
  if (wantsLocalWriter(cfg)) void writer.warm();
};

/** The writer loads once the speech model's load is over: the two do not compete for the disk and the graphics card, and speech is what a dictation needs first. */
export const warmWriterAfter = (speech: Promise<void>, writer: { warm(): Promise<void> }, cfg: WriterChoice): void => void speech.then(() => warmWriter(writer, cfg));

/** A recording starts: a speech model and a writer that were released while idle start loading (speech first), so the load overlaps the recording. */
export function onRecordingStart(models: Pick<ModelManager, "warm">, writer: { warm(): Promise<void> }, cfg: WriterChoice): void {
  warmWriterAfter(models.warm(true), writer, cfg);
}

/** Settings changed while dictation is on: if the rewrite choice was among them, the writer on this computer loads now when it is wanted, and is released when it is not, so it does not hold memory for nothing. */
export function syncWriter(writer: { warm(): Promise<void>; unload(): Promise<void> }, cfg: WriterChoice & { enabled: boolean }, patch: { rewrite?: unknown; rewriteWriter?: unknown }): void {
  if (cfg.enabled && (patch.rewrite || patch.rewriteWriter)) void (wantsLocalWriter(cfg) ? writer.warm() : writer.unload());
}

/** Keeps the computer awake while a recording runs; a failure is logged and the recording goes on. */
export const sleepBlock = (warn: (why: string) => void) => createSleepBlock(powerSaveBlocker, warn);

/** Starts the helper that reads the character before the caret ahead of the first dictation, when smart spacing is on. */
export const warmCaret = (os: DictationOs | undefined, cfg: Pick<DictationConfig, "smartSpacing">): void => {
  if (cfg.smartSpacing) os?.caret?.warm();
};
