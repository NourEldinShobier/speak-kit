import type { DictationState } from "@speakkit/dictation";
import type { HudView } from "../../shared/dictation/contract";
import { hotkeyText } from "../../shared/dictation/keys";
import { errorView, hudViewFor } from "./hud-view";
import type { Hud } from "./hud";

const SETTLE_MS = 150;
const READY_MS = 2000;
const STICKY_MS = 12_000;

interface Deps {
  hud(): Hud | undefined;
  hotkey(): string;
  canRetry(): boolean;
  /** The last insert ended with the text on the clipboard only. */
  insertedAsCopy(): boolean;
}

const busy = (s: DictationState) => s.status === "recording" || s.status === "locked" || s.status === "transcribing" || s.status === "pasting";

/**
 * Decides what the HUD shows. A recording appears after a short settle time, so a tap that is discarded does not flash it; a failure with a button
 * stays until the person answers it (or twelve seconds pass), because the core clears its own error after four seconds.
 */
export class HudPresenter {
  readonly #d: Deps;
  #state: DictationState = { status: "idle" };
  #shown: HudView | null = null;
  #sticky: HudView | null = null;
  #startedAt = 0;
  #level = 0;
  #settle: NodeJS.Timeout | undefined;
  #sticking: NodeJS.Timeout | undefined;
  #ready: NodeJS.Timeout | undefined;

  constructor(deps: Deps) {
    this.#d = deps;
  }

  get shown(): HudView | null {
    return this.#shown;
  }

  onState(state: DictationState): void {
    const wasRecording = this.#state.status === "recording" || this.#state.status === "locked";
    this.#state = state;
    if (state.status === "recording" || state.status === "locked") {
      if (!wasRecording) this.#startedAt = Date.now();
    } else this.#level = 0;
    this.#render();
  }

  setLevel(level: number): void {
    this.#level = level;
    const view = this.#shown;
    if (view?.kind === "recording") this.#d.hud()?.update({ kind: "view", view: { ...view, level } });
  }

  /** The "Dictation ready" pill after dictation is turned on; it goes away by itself. */
  flashReady(): void {
    this.#show({ kind: "ready", hotkey: hotkeyText(this.#d.hotkey()) });
    this.#ready = setTimeout(() => this.#shown?.kind === "ready" && this.#show(null), READY_MS);
  }

  /** A failure that is not a dictation's own (the key hook died): shown like a failed dictation, for as long as one with a button. */
  alert(code: string): void {
    const view = errorView(code, false);
    this.#stick(view);
    this.#show(view);
  }

  dismiss(): void {
    this.#sticky = null;
    clearTimeout(this.#sticking);
    this.#show(null);
  }

  dispose(): void {
    for (const t of [this.#settle, this.#sticking, this.#ready]) clearTimeout(t);
  }

  #render(): void {
    clearTimeout(this.#ready);
    const next = hudViewFor({ state: this.#state, hotkey: this.#d.hotkey(), startedAt: this.#startedAt, level: this.#level, insertedAsCopy: this.#d.insertedAsCopy(), canRetry: this.#d.canRetry() });
    if (busy(this.#state)) this.#clearSticky();
    if (next?.kind === "error" && next.action) this.#stick(next);
    const view = this.#sticky ?? next;
    clearTimeout(this.#settle);
    if (view?.kind === "recording" && this.#shown?.kind !== "recording") this.#settle = setTimeout(() => this.#showRecording(view), SETTLE_MS);
    else this.#show(view);
  }

  #showRecording(view: Extract<HudView, { kind: "recording" }>): void {
    if (this.#state.status === "recording" || this.#state.status === "locked") this.#show({ ...view, level: this.#level });
  }

  #stick(view: HudView): void {
    this.#sticky = view;
    clearTimeout(this.#sticking);
    this.#sticking = setTimeout(() => {
      this.#sticky = null;
      this.#render();
    }, STICKY_MS);
  }

  #clearSticky(): void {
    this.#sticky = null;
    clearTimeout(this.#sticking);
  }

  #show(view: HudView | null): void {
    this.#shown = view;
    const hud = this.#d.hud();
    if (view) hud?.show({ kind: "view", view });
    else hud?.hide();
  }
}
