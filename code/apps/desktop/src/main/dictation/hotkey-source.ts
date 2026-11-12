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

const EMPTY: HotkeyLayout = { hotkey: "", second: "", mouse: "", raw: "", pasteLast: "", cancelKey: CANCEL_KEY, share: false };
const chordOf = (hotkey: string, share: boolean): Chord => ({ keys: hotkeyKeys(hotkey).map((k) => KEY_VK[k]!), ...(share && { share: true }) });

/**
 * Turns the OS hook (a few chords, events on the event loop) into the key stream dictation's session reads. Each chord reads as one key named after
 * its whole shortcut string, so the session needs no notion of chords. The hook is only installed while enabled and not paused.
 */
export function createHotkeys({ os, now, onFault, changed, after = (ms, fn) => (setTimeout(fn, ms).unref?.(), () => undefined) }: Deps): SwitchableHotkeys {
  let handler: ((e: KeyEvent) => boolean) | undefined;
  let layout = EMPTY;
  let enabled = false;
  let grab = false;
  let paused = false;
  let lastFault = -Infinity;
  let pasteLast: (() => void) | undefined;
  let waiting: (() => void) | undefined;

  const emit = (key: string, down: boolean) => handler?.({ key, down, at: now() });
  const nameOf = (chord: string | undefined): string | undefined => (chord === undefined ? layout.hotkey : chord === "second" ? layout.second : chord === "mouse" ? layout.mouse : chord === "raw" ? layout.raw : undefined);
  const onEvent = (e: HotkeyEvent) => {
    if (e.chord === "pasteLast") {
      if (e.kind === "down") pasteLast?.();
      return;
    }
    if (e.kind === "down" || e.kind === "up") {
      const name = nameOf(e.chord);
      if (name) emit(name, e.kind === "down");
    } else if (!e.chord) emit(e.vk === cancelVk(layout.cancelKey) ? layout.cancelKey : keyOfVk(e.vk), true);
  };
  const fault = (e: unknown) => {
    const at = now();
    const retry = enabled && !paused && at - lastFault > REINSTALL_GAP_MS;
    lastFault = at;
    onFault?.(e, retry && run());
  };
  const extras = (): Record<string, Chord> => {
    const out: Record<string, Chord> = {};
    if (layout.second) out.second = chordOf(layout.second, layout.share);
    if (layout.mouse) out.mouse = chordOf(layout.mouse, false);
    if (layout.raw) out.raw = chordOf(layout.raw, layout.share);
    if (layout.pasteLast) out.pasteLast = chordOf(layout.pasteLast, false);
    return out;
  };
  const run = (): boolean => {
    os.stop();
    if (!enabled || paused || !handler || !layout.hotkey) return false;
    os.grab(grab ? [cancelVk(layout.cancelKey)] : []);
    os.setExtraChords?.(extras());
    return os.start(chordOf(layout.hotkey, layout.share), { onEvent, onFault: fault }).ok;
  };

  const resume = () => {
    waiting?.();
    const tryNow = () => {
      waiting = undefined;
      if (!paused) return;
      if (os.anyKeyDown?.()) {
        waiting = after(RESUME_POLL_MS, tryNow);
        return;
      }
      paused = false;
      if (enabled) run();
      changed?.();
    };
    tryNow();
  };

  return {
    subscribe: async (h) => {
      handler = h;
      return () => {
        handler = undefined;
        os.stop();
      };
    },
    enable(on) {
      enabled = on;
      return run() || !on;
    },
    layout(l) {
      layout = l;
      if (enabled && !paused) run();
    },
    setCancelGrab(on) {
      if (grab === on) return;
      grab = on;
      if (enabled && !paused && os.active) os.grab(on ? [cancelVk(layout.cancelKey)] : []);
    },
    pause(on) {
      if (on) {
        waiting?.();
        waiting = undefined;
        paused = true;
        os.stop();
      } else if (paused) resume();
    },
    get paused() {
      return paused;
    },
    get active() {
      return os.active;
    },
    onPasteLast(cb) {
      pasteLast = cb;
    },
    dispose() {
      waiting?.();
      os.stop();
    },
  };
}
