import type { Dictation } from "@speakkit/dictation";
import type { SwitchableHotkeys } from "./hotkey-source";
import type { HudPresenter } from "./hud-presenter";
import { at } from "../../shared/i18n";
import "../../shared/i18n/packs/main";

interface Deps {
  hotkeys(): SwitchableHotkeys | undefined;
  core(): Dictation | undefined;
  presenter: HudPresenter;
  /** Anything the status shows changed. */
  changed(): void;
  /** The Learn correction key was pressed. */
  learn(): Promise<void>;
}

const TOAST = { pasted: "hud.pasted", copied: "hud.copiedPaste", empty: "hud.empty", failed: "hud.pasteFailed" } as const;

/** Pause all shortcuts (by hand), Paste last, Learn correction and Undo cancel: the actions that are not a dictation themselves. */
export class ShortcutControls {
  readonly #d: Deps;
  #paused = false;

  constructor(d: Deps) {
    this.#d = d;
  }

  get paused(): boolean {
    return this.#paused;
  }

  setPaused(on: boolean): void {
    this.#paused = on;
    this.#apply();
  }

  async pasteLast(): Promise<"pasted" | "copied" | "empty" | "failed"> {
    const r = (await this.#d.core()?.pasteLast()) ?? "failed";
    this.#d.presenter.toast(at(TOAST[r]), r === "failed" ? "error" : "ok");
    return r;
  }

  /** Connects the Paste last and Learn correction chords of the key hook to their actions. */
  attach(hotkeys: SwitchableHotkeys): void {
    hotkeys.onPasteLast(() => void this.pasteLast());
    hotkeys.onLearn(() => void this.#d.learn());
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
