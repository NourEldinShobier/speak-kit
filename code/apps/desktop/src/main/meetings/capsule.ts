import type { CapsuleView } from "../../shared/meetings/contract";
import { displayAt, monitorKey, offsetOf, place, type DisplayInfo, type Saved } from "./placement";

export const CAPSULE_SIZE = { width: 520, height: 132 } as const;

/** The window of the capsule as the host drives it. */
export interface CapsuleWindow {
  setPosition(x: number, y: number): void;
  position(): { x: number; y: number };
  /** True lets clicks pass through to what is below (events are still forwarded so the page can see the pointer). */
  setClickThrough(on: boolean): void;
  send(view: CapsuleView | null): void;
  show(): void;
  hide(): void;
  destroy(): void;
  readonly destroyed: boolean;
}

export interface CapsuleDeps {
  open(): CapsuleWindow;
  displays(): DisplayInfo[];
  cursor(): { x: number; y: number };
  saved(): Saved;
  save(positions: Record<string, { x: number; y: number }>): void;
}

/**
 * The capsule: offer, recording indicator, call-ended prompt and "transcript ready" are one small window that shows one thing at a time. Clicks pass
 * through everywhere except on the pill (the page tells when the pointer is on it), the pill can be dragged, and where it is left is remembered per monitor.
 * The window is made again when it was destroyed (a monitor was unplugged under it), and placed again when the monitors change.
 */
export class Capsule {
  readonly #d: CapsuleDeps;
  #win: CapsuleWindow | undefined;
  #view: CapsuleView | null = null;
  #display: DisplayInfo | undefined;

  constructor(d: CapsuleDeps) {
    this.#d = d;
  }

  get view(): CapsuleView | null {
    return this.#view;
  }

  #window(): CapsuleWindow {
    if (!this.#win || this.#win.destroyed) {
      this.#win = this.#d.open();
      this.#win.setClickThrough(true);
    }
    return this.#win;
  }

  #placeOn(display: DisplayInfo | undefined): void {
    if (!display || !this.#win || this.#win.destroyed) return;
    this.#display = display;
    const p = place(display, this.#d.saved(), CAPSULE_SIZE);
    this.#win.setPosition(p.x, p.y);
  }

  /** Shows a view (the monitor the pointer is on, unless the capsule is already showing); null hides it. */
  show(view: CapsuleView | null): void {
    this.#view = view;
    if (!view) {
      if (this.#win && !this.#win.destroyed) {
        this.#win.send(null);
        this.#win.hide();
      }
      return;
    }
    const first = !this.#win || this.#win.destroyed;
    const w = this.#window();
    if (first || !this.#display) this.#placeOn(displayAt(this.#d.displays(), this.#d.cursor()));
    w.send(view);
    w.show();
  }

  /** The pointer is on the pill (it takes clicks) or left it (clicks go through). */
  interactive(on: boolean): void {
    if (this.#win && !this.#win.destroyed) this.#win.setClickThrough(!on);
  }

  /** The pill is being dragged. The window follows, kept on the monitor under the pointer; `end` saves the place for that monitor. */
  drag(dx: number, dy: number, end: boolean): void {
    const w = this.#win;
    if (!w || w.destroyed) return;
    const at = w.position();
    const next = { x: at.x + dx, y: at.y + dy };
    w.setPosition(next.x, next.y);
    if (!end) return;
    const display = displayAt(this.#d.displays(), { x: next.x + CAPSULE_SIZE.width / 2, y: next.y + CAPSULE_SIZE.height / 2 });
    if (!display) return;
    this.#display = display;
    const saved = { ...this.#d.saved(), [monitorKey(display)]: offsetOf(display, next) };
    this.#d.save(saved);
    // Kept fully on the monitor it was dropped on.
    const p = place(display, saved, CAPSULE_SIZE);
    w.setPosition(p.x, p.y);
  }

  /** Monitors were plugged in or out (or changed size): the capsule goes to its saved place on a monitor that exists, the window is made again if it is gone. */
  displaysChanged(): void {
    if (!this.#view) return;
    const here = this.#display && this.#d.displays().find((d) => d.id === this.#display!.id);
    const w = this.#window();
    this.#placeOn(here ?? displayAt(this.#d.displays(), this.#d.cursor()));
    w.send(this.#view);
    w.show();
  }

  dispose(): void {
    if (this.#win && !this.#win.destroyed) this.#win.destroy();
    this.#win = undefined;
  }
}
