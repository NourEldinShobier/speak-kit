import { shell } from "electron";
import type { Clip, Dictation, DictationState } from "@speakkit/dictation";
import type { HudAction } from "../../shared/dictation/channels";
import type { HudPresenter } from "./hud-presenter";
import type { ReplayRecorder } from "./ports";

/** What the last failed dictation left behind, for Try again and for the Sound settings button. */
export interface Failure {
  clip: Clip | undefined;
  error: string;
  replay: ReplayRecorder | undefined;
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
    h.failure.replay?.replay(clip);
    core.start();
    setTimeout(() => core.stop(), 0);
  };
  const openSoundSettings = async (): Promise<void> => {
    if (process.platform !== "win32") return;
    const blocked = h.failure.error === "mic-denied" || h.failure.error === "mic-silent";
    await shell.openExternal(blocked ? "ms-settings:privacy-microphone" : "ms-settings:sound");
  };
  const hudAction = (a: HudAction): void => {
    h.presenter.dismiss();
    if (a === "retry") void retry();
    else if (a === "download") h.download();
    else if (a === "sound-settings") void openSoundSettings();
    else if (a === "undo-cancel") void h.undoCancel();
  };
  return { retry, openSoundSettings, hudAction };
}
