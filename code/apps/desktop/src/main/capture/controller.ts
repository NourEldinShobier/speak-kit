import type { Rectangle } from "electron";
import type { CapsuleState } from "../../shared/capture/capsule";
import type { CaptureConfig } from "../../shared/capture/settings";
import { capsuleFor, type AfterState } from "./session/capsule-state";
import type { SessionState } from "./session";
import type { CapsuleHandle, OverlayHandle } from "./windows";

export interface ControllerDeps {
  openCapsule(bounds: Rectangle): CapsuleHandle;
  openInk(bounds: Rectangle): OverlayHandle;
  session(): SessionState;
  title(): string;
  /** The display the capture is on, as its rectangle in device-independent pixels. */
  displayBounds(): Rectangle;
  settings(): CaptureConfig;
  now(): number;
  /** Called when the capsule state changed, for the app window. */
  changed(state: CapsuleState | null): void;
}

/** The capsule and the ink layer: what is drawn while recording and after it, and the pen. The state is computed by `capsuleFor`; this class only keeps the flags and windows. */
export class CaptureController {
  readonly #d: ControllerDeps;
  #capsule: CapsuleHandle | undefined;
  #ink: OverlayHandle | undefined;
  #after: AfterState | undefined;
  #afterTimer: ReturnType<typeof setTimeout> | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #last = "";
  pen = false;
  confirmDiscard = false;
  micMissing = false;
  switching = false;
  state: CapsuleState | null = null;

  constructor(deps: ControllerDeps) {
    this.#d = deps;
  }

  /** Recomputes the capsule and shows, updates or hides it. Also runs the clock while recording. */
  update() {
    const state = capsuleFor({
      session: this.#d.session(),
      title: this.#d.title(),
      now: this.#d.now(),
      pen: this.pen,
      confirmDiscard: this.confirmDiscard,
      micMissing: this.micMissing,
      dictationPaused: false,
      switching: this.switching,
      after: this.#after,
    });
    this.state = state;
    const recording = this.#d.session().phase === "recording";
    if (recording && !this.#timer) this.#timer = setInterval(() => this.update(), 1000);
    if (!recording && this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    const key = JSON.stringify(state);
    if (key === this.#last) return;
    this.#last = key;
    if (state && !this.#capsule) this.#capsule = this.#d.openCapsule(this.#d.displayBounds());
    void this.#capsule?.push(state);
    this.#d.changed(state);
  }

  /** What stays on screen once the session is idle. `ms` of 0 keeps it until it is closed. */
  after(state: AfterState | undefined, ms = 8000) {
    clearTimeout(this.#afterTimer);
    this.#after = state;
    if (state && ms > 0)
      this.#afterTimer = setTimeout(() => {
        this.#after = undefined;
        this.update();
      }, ms);
    this.update();
  }

  /** Starts a new recording: the flags of the last one are gone. */
  reset() {
    this.pen = false;
    this.confirmDiscard = false;
    this.micMissing = false;
    this.switching = false;
    this.hideInk();
    this.#capsule?.moveTo(this.#d.displayBounds());
  }

  /** The recorded display became known or changed: the capsule moves there. */
  relocate() {
    this.#capsule?.moveTo(this.#d.displayBounds());
  }

  owns(contents: Electron.WebContents): boolean {
    return !!this.#capsule && !this.#capsule.window.isDestroyed() && this.#capsule.window.webContents === contents;
  }

  hover(over: boolean) {
    this.#capsule?.window.setIgnoreMouseEvents(!over, { forward: true });
  }

  /** Draw on the screen: clicks stop reaching the program below while this is on. */
  showInk() {
    const { inkFadeMs, pointerTrail } = this.#d.settings();
    this.#ink ??= this.#d.openInk(this.#d.displayBounds());
    void this.#ink.show({ mode: "ink", inkFadeMs, trail: pointerTrail, display: { id: "", name: "", width: 0, height: 0, scaleFactor: 1 }, windows: [], switching: false });
  }

  hideInk() {
    this.#ink?.close();
    this.#ink = undefined;
  }

  dispose() {
    clearTimeout(this.#afterTimer);
    if (this.#timer) clearInterval(this.#timer);
    this.#capsule?.close();
    this.hideInk();
    this.#capsule = undefined;
  }
}
