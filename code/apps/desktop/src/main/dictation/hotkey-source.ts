import type { HotkeySource as CoreHotkeys, KeyEvent } from "@speakkit/dictation";
import { cancelVk, CANCEL_KEY, hotkeyKeys, KEY_VK, keyOfVk } from "../../shared/dictation/keys";
import { type Chord, type HotkeyEvent, type HotkeySource as OsHotkeys } from "./types";

/** Every shortcut that reaches the key hook. An empty string is unset and registers nothing. */
export interface HotkeyLayout {
  hotkey: string;
  second: string;
  /** A mouse button code such as "Mouse4". */
  mouse: string;
  raw: string;
  pasteLast: string;
  transform: string;
  cancelKey: string;
  /** Let the dictation keys through to the app in front too. */
  share: boolean;
}

export interface SwitchableHotkeys extends CoreHotkeys {
  /** Installs (true) or removes (false) the system-wide hook. While off, nothing is hooked and no key is touched. */
  enable(on: boolean): boolean;
  /** Takes the new shortcuts at once, also while the hook runs. */
  layout(l: HotkeyLayout): void;
  /** Swallow the cancel key while a toggled recording runs, and only then. */
  setCancelGrab(on: boolean): void;
  /** Keys pass through while paused. Resuming waits until no key is held, so a key held through the pause never counts as a press. */
  pause(on: boolean): void;
  readonly paused: boolean;
  readonly active: boolean;
  /** The Paste last chord was pressed. */
  onPasteLast(cb: () => void): void;
  /** The Clean up the field chord was pressed. */
  onTransform(cb: () => void): void;
  dispose(): void;
}

/** A hook that dies again within this time after a reinstall is not reinstalled again (a callback that always throws would loop). */
const REINSTALL_GAP_MS = 10_000;
const RESUME_POLL_MS = 50;

interface Deps {
  os: OsHotkeys;
  now(): number;
  /** The hook died. `recovered` is true when it was reinstalled and runs again; false means the hotkey is dead until dictation is switched off and on. */
  onFault?(e: unknown, recovered: boolean): void;
  /** Schedules the wait before resuming; defaults to setTimeout. */
  after?(ms: number, fn: () => void): () => void;
  /** The paused state changed (resuming happens later than asked, once no key is held). */
  changed?(): void;
}

const EMPTY: HotkeyLayout = { hotkey: "", second: "", mouse: "", raw: "", pasteLast: "", transform: "", cancelKey: CANCEL_KEY, share: false };
const chordOf = (hotkey: string, share: boolean): Chord => ({ keys: hotkeyKeys(hotkey).map((k) => KEY_VK[k]!), ...(share && { share: true }) });
const defaultAfter = (ms: number, fn: () => void): (() => void) => {
  const t = setTimeout(fn, ms);
  t.unref?.();
  return () => clearTimeout(t);
};

/**
 * Turns the OS hook (a few chords, events on the event loop) into the key stream dictation's session reads. Each chord reads as one key named after
 * its whole shortcut string, so the session needs no notion of chords. The hook is only installed while enabled and not paused.
 */
class Hotkeys implements SwitchableHotkeys {
  readonly #d: Required<Pick<Deps, "os" | "now" | "after">> & Pick<Deps, "onFault" | "changed">;
  #handler: ((e: KeyEvent) => boolean) | undefined;
  #layout = EMPTY;
  #enabled = false;
  #grab = false;
  #paused = false;
  #lastFault = -Infinity;
  #pasteLast: (() => void) | undefined;
  #transform: (() => void) | undefined;
  #waiting: (() => void) | undefined;
  #generation = 0;
  /** Shortcuts the session saw go down and not up yet. */
  readonly #held = new Set<string>();

  constructor(d: Deps) {
    this.#d = { ...d, after: d.after ?? defaultAfter };
  }

  get paused(): boolean {
    return this.#paused;
  }
  get active(): boolean {
    return this.#d.os.active;
  }

  async subscribe(h: (e: KeyEvent) => boolean): Promise<() => void> {
    this.#handler = h;
    return () => {
      this.#handler = undefined;
      this.#d.os.stop();
    };
  }

  enable(on: boolean): boolean {
    this.#enabled = on;
    return this.#run() || !on;
  }

  layout(l: HotkeyLayout): void {
    this.#layout = l;
    if (this.#enabled && !this.#paused) this.#run();
  }

  setCancelGrab(on: boolean): void {
    if (this.#grab === on) return;
    this.#grab = on;
    if (this.#enabled && !this.#paused && this.#d.os.active) this.#d.os.grab(on ? [cancelVk(this.#layout.cancelKey)] : []);
  }

  onPasteLast(cb: () => void): void {
    this.#pasteLast = cb;
  }

  onTransform(cb: () => void): void {
    this.#transform = cb;
  }

  pause(on: boolean): void {
    if (on) {
      this.#generation++;
      this.#waiting?.();
      this.#waiting = undefined;
      this.#paused = true;
      this.#d.os.stop();
      // The release will never arrive through the removed hook: report it, so the session does not wait for a key that is up.
      for (const key of this.#held) this.#emit(key, false);
      this.#held.clear();
    } else if (this.#paused) this.#resume();
  }

  dispose(): void {
    this.#waiting?.();
    this.#d.os.stop();
  }

  #emit(key: string, down: boolean): void {
    this.#handler?.({ key, down, at: this.#d.now() });
  }

  /** The name the session knows a chord by: its shortcut string. */
  #nameOf(chord: string | undefined): string | undefined {
    const l = this.#layout;
    return chord === undefined ? l.hotkey : { second: l.second, mouse: l.mouse, raw: l.raw }[chord];
  }

  readonly #onEvent = (e: HotkeyEvent): void => {
    if (e.chord === "pasteLast" || e.chord === "transform") {
      if (e.kind === "down") (e.chord === "pasteLast" ? this.#pasteLast : this.#transform)?.();
      return;
    }
    if (e.kind === "down" || e.kind === "up") {
      const name = this.#nameOf(e.chord);
      if (name) {
        if (e.kind === "down") this.#held.add(name);
        else this.#held.delete(name);
        this.#emit(name, e.kind === "down");
      }
    } else if (!e.chord) this.#emit(e.vk === cancelVk(this.#layout.cancelKey) ? this.#layout.cancelKey : keyOfVk(e.vk), true);
  };

  readonly #onFault = (e: unknown): void => {
    const at = this.#d.now();
    const retry = this.#enabled && !this.#paused && at - this.#lastFault > REINSTALL_GAP_MS;
    this.#lastFault = at;
    this.#d.onFault?.(e, retry && this.#run());
  };

  #extras(): Record<string, Chord> {
    const l = this.#layout;
    const out: Record<string, Chord> = {};
    if (l.second) out.second = chordOf(l.second, l.share);
    if (l.mouse) out.mouse = chordOf(l.mouse, false);
    if (l.raw) out.raw = chordOf(l.raw, l.share);
    if (l.pasteLast) out.pasteLast = chordOf(l.pasteLast, false);
    if (l.transform) out.transform = chordOf(l.transform, false);
    return out;
  }

  #run(): boolean {
    const { os } = this.#d;
    os.stop();
    if (!this.#enabled || this.#paused || !this.#handler || !this.#layout.hotkey) return false;
    os.grab(this.#grab ? [cancelVk(this.#layout.cancelKey)] : []);
    os.setExtraChords?.(this.#extras());
    return os.start(chordOf(this.#layout.hotkey, this.#layout.share), { onEvent: this.#onEvent, onFault: this.#onFault }).ok;
  }

  /** Resumes once no key is held, so a key held through the pause never counts as a press. */
  #resume(): void {
    this.#waiting?.();
    const mine = ++this.#generation;
    const tryNow = () => {
      this.#waiting = undefined;
      if (!this.#paused || mine !== this.#generation) return;
      if (this.#d.os.anyKeyDown?.()) {
        this.#waiting = this.#d.after(RESUME_POLL_MS, tryNow);
        return;
      }
      this.#paused = false;
      if (this.#enabled) this.#run();
      this.#d.changed?.();
    };
    tryNow();
  }
}

export function createHotkeys(deps: Deps): SwitchableHotkeys {
  return new Hotkeys(deps);
}
