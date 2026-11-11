import type { HudView } from "../../shared/dictation/contract";

export type HudState =
  /** The app's own HUD page draws this; the built-in page shows it as an empty pill. */
  | { kind: "view"; view: HudView }
  /** `level` is the microphone level, 0 to 1. */
  | { kind: "recording"; level: number }
  | { kind: "transcribing" }
  /** A short message such as "Copied" or an error; the caller owns the wording. */
  | { kind: "notice"; tone: "info" | "error"; text: string };

/** One HUD window as the platform provides it. */
export interface HudWindow {
  /** Settles when the page can take states; rejects when it failed to load. */
  readonly ready: Promise<void>;
  readonly destroyed: boolean;
  push(state: HudState): void;
  /** True when `contents` is this window's page (the HUD buttons report through it). */
  owns?(contents: Electron.WebContents): boolean;
  /** Moves the window to its place on the screen and shows it without taking focus. */
  showInactive(): void;
  hide(): void;
  destroy(): void;
}

export interface Hud {
  /** True while a window exists (visible or hidden, waiting to be reused). */
  readonly exists: boolean;
  /** Shows the HUD with this state, creating the window if there is none. The foreground window keeps focus. */
  show(state: HudState): void;
  /** Changes what a visible HUD shows; nothing happens while it is hidden. */
  update(state: HudState): void;
  /** Hides the HUD; the window is destroyed after `idleMs` without another `show`. */
  hide(): void;
  dispose(): void;
}

interface Deps {
  open(): HudWindow;
  /** How long a hidden window is kept for the next dictation before it is destroyed (an idle window costs a renderer process). */
  idleMs?: number | undefined;
}

/**
 * The recording HUD. There is no window until the first `show` and none again after `idleMs` hidden. Showing never moves keyboard focus:
 * the window is created non-focusable and shown with showInactive, so the app the user is typing into stays foreground.
 */
export class HudController implements Hud {
  readonly #open: () => HudWindow;
  readonly #idleMs: number;
  #win: HudWindow | null = null;
  #wanted = false;
  #shown = false;
  #loaded = false;
  #latest: HudState | null = null;
  #idle: NodeJS.Timeout | undefined;

  constructor({ open, idleMs = 20_000 }: Deps) {
    this.#open = open;
    this.#idleMs = idleMs;
  }

  get exists(): boolean {
    return this.#win !== null && !this.#win.destroyed;
  }

  show(state: HudState): void {
    this.#wanted = true;
    this.#latest = state;
    clearTimeout(this.#idle);
    this.#flush(this.#win && !this.#win.destroyed ? this.#win : this.#create());
  }

  update(state: HudState): void {
    if (!this.#wanted || !this.#win) return;
    this.#latest = state;
    this.#flush(this.#win);
  }

  hide(): void {
    this.#wanted = false;
    this.#shown = false;
    if (!this.#win) return;
    this.#win.hide();
    clearTimeout(this.#idle);
    this.#idle = setTimeout(() => this.#destroy(), this.#idleMs);
  }

  dispose(): void {
    this.#wanted = false;
    this.#destroy();
  }

  #destroy(): void {
    clearTimeout(this.#idle);
    const w = this.#win;
    this.#win = null;
    this.#shown = false;
    this.#loaded = false;
    if (w && !w.destroyed) w.destroy();
  }

  #flush(w: HudWindow): void {
    if (this.#win !== w || !this.#loaded || !this.#wanted || w.destroyed || !this.#latest) return;
    w.push(this.#latest);
    if (!this.#shown) {
      this.#shown = true;
      w.showInactive();
    }
  }

  #create(): HudWindow {
    const w = this.#open();
    this.#win = w;
    this.#shown = false;
    this.#loaded = false;
    // A page that never loads would otherwise leave a dead window; the HUD is not worth an error, the next show opens a new one.
    w.ready.then(
      () => {
        if (this.#win !== w) return;
        this.#loaded = true;
        this.#flush(w);
      },
      () => this.#win === w && this.#destroy(),
    );
    return w;
  }
}

export const createHud = (deps: Deps): Hud => new HudController(deps);
