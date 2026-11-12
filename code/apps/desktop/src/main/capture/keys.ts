import type { HotkeySource } from "../dictation/types";
import { createGesture, type GestureAction, type GestureEvent } from "./gesture";
import { captureHotkey, type CaptureHotkey } from "./gesture/hotkey";

export interface KeysDeps {
  /** Opens a key hook (the dictation platform's). Missing where there is none. */
  open?: (() => Promise<HotkeySource>) | undefined;
  recording(): boolean;
  onAction(a: GestureAction): void;
  /** The screenshot key was released. */
  onShot(): void;
  log(line: string): void;
}

const POLL_MS = 50;

/** The capture key and the screenshot key, from the operating system's key hooks, turned into what the person meant (see the gesture). */
export class CaptureKeys {
  readonly #d: KeysDeps;
  readonly #gesture = createGesture();
  #capture: CaptureHotkey | undefined;
  #shot: CaptureHotkey | undefined;
  #poll: ReturnType<typeof setInterval> | undefined;

  constructor(deps: KeysDeps) {
    this.#d = deps;
  }

  get active(): boolean {
    return !!this.#capture?.active;
  }

  /** Starts or stops the hooks to match the settings. Returns false when a key could not be hooked. */
  async apply(on: boolean, keys: { capture: string; screenshot: string | undefined }): Promise<boolean> {
    if (!on) {
      this.stop();
      return true;
    }
    let ok = true;
    if (!this.#capture) ok = !!(this.#capture = await this.#hook(keys.capture, (e) => this.#key(e)));
    if (keys.screenshot && !this.#shot) ok = !!(this.#shot = await this.#hook(keys.screenshot, (e) => e.kind === "up" && this.#d.onShot())) && ok;
    if (!keys.screenshot) this.#stopShot();
    return ok;
  }

  async #hook(hotkey: string, onEvent: (e: GestureEvent) => void): Promise<CaptureHotkey | undefined> {
    if (!this.#d.open) return undefined;
    try {
      const hook = captureHotkey(await this.#d.open());
      const r = hook.start(hotkey, onEvent);
      if (r.ok) return hook;
      this.#d.log(`capture hotkey did not start: ${r.reason}`);
    } catch (e) {
      this.#d.log(`capture hotkey did not start: ${String(e)}`);
    }
    return undefined;
  }

  /** The key as the hook reports it; tests call it directly. */
  press(e: GestureEvent) {
    this.#key(e);
  }

  #key(e: GestureEvent) {
    for (const a of this.#gesture.event(e, performance.now(), this.#d.recording())) this.#d.onAction(a);
    if (this.#gesture.down && !this.#poll) this.#poll = setInterval(() => this.#tick(), POLL_MS);
    if (!this.#gesture.down) this.#stopPoll();
  }

  #tick() {
    for (const a of this.#gesture.tick(performance.now(), this.#d.recording())) this.#d.onAction(a);
  }

  #stopPoll() {
    if (this.#poll) clearInterval(this.#poll);
    this.#poll = undefined;
  }

  #stopShot() {
    this.#shot?.stop();
    this.#shot = undefined;
  }

  /** Forgets keys believed down (screen lock, sleep). */
  resync() {
    this.#gesture.reset();
    this.#capture?.resync();
    this.#shot?.resync();
  }

  stop() {
    this.#stopPoll();
    this.#capture?.stop();
    this.#capture = undefined;
    this.#stopShot();
    this.#gesture.reset();
  }
}
