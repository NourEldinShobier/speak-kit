import type { HookKey, InstalledHook } from "../keyboard-hook";
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
