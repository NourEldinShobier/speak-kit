import type { ShiftAction, ShiftEvent } from "./gesture/shift-ink";
import type { HotkeySource } from "../dictation/types";
import { createGesture, type GestureAction, type GestureEvent } from "./gesture";
import { captureHotkey, shiftHotkey, type CaptureHotkey, type ShiftHook } from "./gesture/hotkey";
import { createShiftInk } from "./gesture/shift-ink";

export interface KeysDeps {
  /** Opens a key hook (the dictation platform's). Missing where there is none. */
  open?: (() => Promise<HotkeySource>) | undefined;
  recording(): boolean;
  onAction(a: GestureAction | ShiftAction): void;
  /** The screenshot key was released. */
  onShot(): void;
  /** The screen recording key was released. */
  onRecord?(): void;
  /** The replay key was released. */
  onReplay?(): void;
  log(line: string): void;
}

const POLL_MS = 50;

/** The capture key and the screenshot key, from the operating system's key hooks, turned into what the person meant (see the gesture). */
export class CaptureKeys {
  readonly #d: KeysDeps;
  readonly #gesture = createGesture();
  readonly #shiftInk = createShiftInk();
  #shiftHook: ShiftHook | undefined;
  #capture: CaptureHotkey | undefined;
  #shot: CaptureHotkey | undefined;
  #rec: CaptureHotkey | undefined;
  #replay: CaptureHotkey | undefined;
  #poll: ReturnType<typeof setInterval> | undefined;

  constructor(deps: KeysDeps) {
    this.#d = deps;
  }

  get active(): boolean {
    return !!this.#capture?.active;
  }

  /** Starts or stops the hooks to match the settings. Returns false when a key could not be hooked. */
  async apply(on: boolean, keys: { capture: string; screenshot: string | undefined; recording?: string | undefined; replay?: string | undefined; shiftInk?: boolean }): Promise<boolean> {
    if (!on) {
      this.stop();
      return true;
    }
    let ok = true;
    if (!this.#capture) ok = !!(this.#capture = await this.#hook(keys.capture, (e) => this.#key(e)));
    if (keys.screenshot && !this.#shot) ok = !!(this.#shot = await this.#hook(keys.screenshot, (e) => e.kind === "up" && this.#d.onShot())) && ok;
    if (!keys.screenshot) this.#stopShot();
    if (keys.recording && !this.#rec) ok = !!(this.#rec = await this.#hook(keys.recording, (e) => e.kind === "up" && this.#d.onRecord?.())) && ok;
    if (!keys.recording) this.#stopRec();
    if (keys.replay && !this.#replay) ok = !!(this.#replay = await this.#hook(keys.replay, (e) => e.kind === "up" && this.#d.onReplay?.())) && ok;
    if (!keys.replay) this.#stopReplay();
    if (keys.shiftInk) this.#shiftHook ??= await this.#hookShift();
    else this.#stopShiftHook();
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

  /** Shift alone draws, from a second key hook. Not reaching it is not a failure of the capture key: the pen button still draws. */
  async #hookShift(): Promise<ShiftHook | undefined> {
    if (!this.#d.open) return undefined;
    try {
      const hook = shiftHotkey(await this.#d.open());
      const r = hook.start((e) => this.#shift(e));
      if (r.ok) return hook;
      this.#d.log(`capture shift hook did not start: ${r.reason}`);
    } catch (e) {
      this.#d.log(`capture shift hook did not start: ${String(e)}`);
    }
    return undefined;
  }

  #shift(e: ShiftEvent) {
    for (const a of this.#shiftInk.event(e, performance.now(), this.#d.recording())) this.#d.onAction(a);
    this.#syncPoll();
  }

  #syncPoll() {
    if ((this.#gesture.down || this.#shiftInk.down) && !this.#poll) this.#poll = setInterval(() => this.#tick(), POLL_MS);
    if (!this.#gesture.down && !this.#shiftInk.down) this.#stopPoll();
  }

  #stopShiftHook() {
    this.#shiftHook?.stop();
    this.#shiftHook = undefined;
    this.#shiftInk.reset();
  }

  /** The key as the hook reports it; tests call it directly. */
  press(e: GestureEvent) {
    this.#key(e);
  }

  #key(e: GestureEvent) {
    for (const a of this.#gesture.event(e, performance.now(), this.#d.recording())) this.#d.onAction(a);
    this.#syncPoll();
  }

  /** Shift as the hook reports it; tests call it directly. */
  pressShift(e: ShiftEvent) {
    this.#shift(e);
  }

  #tick() {
    const at = performance.now();
    for (const a of [...this.#gesture.tick(at, this.#d.recording()), ...this.#shiftInk.tick(at, this.#d.recording())]) this.#d.onAction(a);
  }

  #stopPoll() {
    if (this.#poll) clearInterval(this.#poll);
    this.#poll = undefined;
  }

  #stopRec() {
    this.#rec?.stop();
    this.#rec = undefined;
  }

  #stopReplay() {
    this.#replay?.stop();
    this.#replay = undefined;
  }

  #stopShot() {
    this.#shot?.stop();
    this.#shot = undefined;
  }

  /** Forgets keys believed down (screen lock, sleep). */
  resync() {
    this.#gesture.reset();
    this.#shiftInk.reset();
    this.#capture?.resync();
    this.#shot?.resync();
    this.#rec?.resync();
    this.#replay?.resync();
    this.#shiftHook?.resync();
  }

  stop() {
    this.#stopPoll();
    this.#capture?.stop();
    this.#capture = undefined;
    this.#stopShot();
    this.#stopRec();
    this.#stopReplay();
    this.#stopShiftHook();
    this.#gesture.reset();
  }
}
