import type { HookClick, HookKey, InstalledHook } from "../keyboard-hook";
import { modifierDown, OWN_EVENT_MARKER, vkOfMacKey } from "./keymap";
import type { MacNative } from "./native";

const KEY_DOWN = 10;
const KEY_UP = 11;
const FLAGS_CHANGED = 12;
// The key hook treats this flag plus its marker as "injected by us".
const INJECTED = 0x10;

/**
 * Installs the key event tap. `onKey` runs inside the tap callback, which macOS waits for before it delivers the key, so it must only decide:
 * return true to swallow. If it throws, the key is passed on, the tap is removed at once and `onFault` is called from the event loop afterwards.
 * Throws when macOS refuses the tap (Accessibility or Input Monitoring not granted).
 */
export function installTapHook(native: MacNative, onKey: (key: HookKey) => boolean, onFault: (error: unknown) => void): InstalledHook {
  let dead = false;
  const tap = native.createTap((e) => {
    if (dead) return false;
    try {
      const vk = vkOfMacKey(e.keycode);
      const extra = e.userData;
      const flags = extra === OWN_EVENT_MARKER ? INJECTED : 0;
      if (e.type === FLAGS_CHANGED) {
        const down = modifierDown(e.keycode, e.flags);
        return down === null ? false : onKey({ vk, flags, extra, down });
      }
      if (e.type !== KEY_DOWN && e.type !== KEY_UP) return false;
      return onKey({ vk, flags, extra, down: e.type === KEY_DOWN });
    } catch (error) {
      dead = true;
      setImmediate(() => {
        tap.remove();
        onFault(error);
      });
      return false;
    }
  });
  return {
    uninstall() {
      dead = true;
      tap.remove();
    },
  };
}

// CGEventType of the mouse buttons: left 1 and 2, right 3 and 4, any other button 25 and 26 (button number 2 is the middle one, 3 and 4 the side buttons).
const BUTTON_TYPES: Readonly<Record<number, { down: boolean; vk?: number }>> = {
  1: { down: true, vk: 0x01 },
  2: { down: false, vk: 0x01 },
  3: { down: true, vk: 0x02 },
  4: { down: false, vk: 0x02 },
  25: { down: true },
  26: { down: false },
};

/** The code of a mouse event as the chord tracker knows buttons (same numbers as on Windows), or undefined for a button it has no code for. */
export function mouseButtonOf(type: number, button: number): { vk: number; down: boolean } | undefined {
  const t = BUTTON_TYPES[type];
  if (!t) return undefined;
  const vk = t.vk ?? (button >= 2 && button <= 4 ? 0x02 + button : undefined);
  return vk === undefined ? undefined : { vk, down: t.down };
}

/** Mouse button tap with the same contract as the key tap: `onClick` only decides, a throw removes the tap and reports the fault afterwards. */
export function installMouseTap(native: MacNative, onClick: (click: HookClick) => boolean, onFault: (error: unknown) => void): InstalledHook {
  let dead = false;
  const tap = native.createTap((e) => {
    if (dead) return false;
    try {
      const b = mouseButtonOf(e.type, e.keycode);
      return b ? onClick({ ...b, extra: 0, flags: 0 }) : false;
    } catch (error) {
      dead = true;
      setImmediate(() => {
        tap.remove();
        onFault(error);
      });
      return false;
    }
  }, "mouse");
  return {
    uninstall() {
      dead = true;
      tap.remove();
    },
  };
}
