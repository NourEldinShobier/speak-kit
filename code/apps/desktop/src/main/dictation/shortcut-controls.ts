import type { Dictation } from "@speakkit/dictation";
import type { PauseRules } from "../../shared/dictation/settings";
import type { SwitchableHotkeys } from "./hotkey-source";
import type { HudPresenter } from "./hud-presenter";
import { watchPauseRules } from "./pause-watch";
import type { ForegroundInfo } from "./types";
import { at } from "../../shared/i18n";
import "../../shared/i18n/packs/main";

interface Deps {
  hotkeys(): SwitchableHotkeys | undefined;
  core(): Dictation | undefined;
  presenter: HudPresenter;
  foreground(): ForegroundInfo | null;
  /** The pause rules while dictation is on, else undefined. */
  rules(): PauseRules | undefined;
  /** Anything the status shows changed. */
  changed(): void;
}

const TOAST = { pasted: "hud.pasted", copied: "hud.copiedPaste", empty: "hud.empty", failed: "hud.pasteFailed" } as const;

/** Pause all shortcuts (by hand or by the program in front), Paste last and Undo cancel: the actions that are not a dictation themselves. */
export class ShortcutControls {
  readonly #d: Deps;
  #manual = false;
  #auto = false;
  #stop: (() => void) | undefined;

  constructor(d: Deps) {
    this.#d = d;
  }

  get paused(): boolean {
    return this.#manual || this.#auto;
  }

  setPaused(on: boolean): void {
    this.#manual = on;
    this.#apply();
  }

  /** (Re)starts the watch for pause rules; call after the settings or the on/off switch changed. */
  watch(): void {
    this.#stop?.();
    this.#stop = undefined;
    const rules = this.#d.rules();
    if (rules && (rules.mode !== "off" || rules.fullscreen)) {
      this.#stop = watchPauseRules({
        rules: this.#d.rules,
        foreground: this.#d.foreground,
        changed: (on) => {
          this.#auto = on;
          this.#apply();
        },
      });
    } else if (this.#auto) {
      this.#auto = false;
      this.#apply();
    }
  }

  dispose(): void {
    this.#stop?.();
  }

  async pasteLast(): Promise<"pasted" | "copied" | "empty" | "failed"> {
    const r = (await this.#d.core()?.pasteLast()) ?? "failed";
    this.#d.presenter.toast(at(TOAST[r]), r === "failed" ? "error" : "ok");
    return r;
  }

  undoCancel(): boolean {
    this.#d.presenter.dismiss();
    return this.#d.core()?.undoCancel() ?? false;
  }

  #apply(): void {
    // The hook carries the stop and cancel keys, so a recording that outlives it could not be ended: it ends here.
    if (this.paused) this.#d.core()?.cancel();
    this.#d.hotkeys()?.pause(this.paused);
    this.#d.changed();
  }
}
