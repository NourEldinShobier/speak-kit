import type { HotkeySource as CoreHotkeys, KeyEvent } from "@speakkit/dictation";
import { CANCEL_KEY, hotkeyKeys, KEY_VK, keyOfVk } from "../../shared/dictation/keys";
import { VK, type HotkeyEvent, type HotkeySource as OsHotkeys } from "./types";

export interface SwitchableHotkeys extends CoreHotkeys {
  /** Installs (true) or removes (false) the system-wide hook. While off, nothing is hooked and no key is touched. */
  enable(on: boolean): boolean;
  /** Takes the new chord at once, also while the hook runs. */
  setHotkey(hotkey: string): void;
  /** Swallow the cancel key while a toggled recording runs, and only then. */
  setCancelGrab(on: boolean): void;
  readonly active: boolean;
}

interface Deps {
  os: OsHotkeys;
  now(): number;
  onFault?(e: unknown): void;
}

/**
 * Turns the OS hook (one chord, events on the event loop) into the key stream dictation's session reads. The chord reads as one key named after the
 * whole hotkey string, so the session needs no notion of chords. The hook is only installed while enabled.
 */
export function createHotkeys({ os, now, onFault }: Deps): SwitchableHotkeys {
  let handler: ((e: KeyEvent) => boolean) | undefined;
  let hotkey = "";
  let enabled = false;
  let grab = false;

  const emit = (key: string, down: boolean) => handler?.({ key, down, at: now() });
  const onEvent = (e: HotkeyEvent) => {
    if (e.kind === "down") emit(hotkey, true);
    else if (e.kind === "up") emit(hotkey, false);
    else if (e.kind === "other" || e.kind === "grabbed") emit(e.vk === VK.escape ? CANCEL_KEY : keyOfVk(e.vk), true);
  };
  const run = () => {
    os.stop();
    if (!enabled || !handler || !hotkey) return false;
    os.grab(grab ? [VK.escape] : []);
    return os.start({ keys: hotkeyKeys(hotkey).map((k) => KEY_VK[k]!) }, { onEvent, ...(onFault && { onFault }) }).ok;
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
    setHotkey(h) {
      hotkey = h;
      if (enabled) run();
    },
    setCancelGrab(on) {
      if (grab === on) return;
      grab = on;
      if (enabled && os.active) os.grab(on ? [VK.escape] : []);
    },
    get active() {
      return os.active;
    },
  };
}
