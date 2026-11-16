import { shell } from "electron";
import type { Clip, Dictation, DictationState } from "@speakkit/dictation";
import type { HudAction } from "../../shared/dictation/channels";
import type { HudPresenter } from "./hud-presenter";
import type { ReplayRecorder } from "./ports";
import { soundSettingsUrl } from "./service-support";

/** What the last failed dictation left behind, for Try again and for the Sound settings button. */
export interface Failure {
  clip: Clip | undefined;
  error: string;
  replay: ReplayRecorder | undefined;
  /** The newest failure the Settings page shows until a dictation works again or the person dismisses it. */
  last?: { code: string; at: number; owner?: string } | undefined;
}

interface Host {
  ready(): Promise<unknown>;
  failure: Failure;
  core(): Dictation | undefined;
  state(): DictationState;
  presenter: HudPresenter;
  /** Brings the app window to the Dictation page and starts the model download. */
  download(): void;
  undoCancel(): Promise<boolean>;
  /** Puts the newest dictation on the clipboard. */
  copyLast(): Promise<void>;
  /** Inserts the newest dictation again into the window in front. */
  pasteAgain(): Promise<void>;
  /** The status changed (the last failure was answered). */
  changed?(): void;
}

/** The buttons of the HUD and the Settings page that act on the last dictation: Try again, Sound settings, Download, Undo. */
export function createActions(h: Host) {
  const retry = async (): Promise<void> => {
    await h.ready();
    const core = h.core();
    const clip = h.failure.clip;
    const state = h.state().status;
    if (!clip || !core || (state !== "idle" && state !== "error")) return;
    h.failure.clip = undefined;
    h.failure.last = undefined;
    h.changed?.();
    h.failure.replay?.replay(clip);
    core.start();
    setTimeout(() => core.stop(), 0);
  };
  const openSoundSettings = async (): Promise<void> => {
    const url = soundSettingsUrl(process.platform, h.failure.error === "mic-denied" || h.failure.error === "mic-silent");
    if (url) await shell.openExternal(url);
  };
  const hudAction = (a: HudAction): void => {
    if (a !== "cancel-recording") h.presenter.dismiss();
    if (a === "dismiss" && h.failure.last) {
      h.failure.last = undefined;
      h.changed?.();
    }
    if (a === "retry") void retry();
    else if (a === "download") h.download();
    else if (a === "sound-settings") void openSoundSettings();
    else if (a === "undo-cancel") void h.undoCancel();
    else if (a === "cancel-recording") h.core()?.cancel();
    else if (a === "copy-last") void h.copyLast();
    else if (a === "paste-again") void h.pasteAgain();
  };
  return { retry, openSoundSettings, hudAction };
}
