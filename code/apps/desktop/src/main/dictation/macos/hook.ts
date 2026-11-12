import type { HookClick, HookKey, InstalledHook } from "../keyboard-hook";
import { modifierDown, OWN_EVENT_MARKER, vkOfMacKey } from "./keymap";
import { mouseButtonOf } from "./mouse-button";
import type { MacNative, TapEvent } from "./native";

const KEY_DOWN = 10;
const KEY_UP = 11;
const FLAGS_CHANGED = 12;
// The key hook treats this flag plus its marker as "injected by us".
const INJECTED = 0x10;

/**
 * Installs an event tap. `handle` runs inside the tap callback, which macOS waits for before it delivers the event, so it must only decide:
 * return true to swallow. If it throws, the event is passed on, the tap is removed at once and `onFault` is called from the event loop afterwards.
 * Throws when macOS refuses the tap (Accessibility or Input Monitoring not granted).
 */
function installTap(native: MacNative, tapKind: { kind: "keys" | "mouse"; handle: (e: TapEvent) => boolean }, onFault: (error: unknown) => void): InstalledHook {
  const { kind, handle } = tapKind;
  let dead = false;
  const tap = native.createTap((e) => {
    if (dead) return false;
    try {
      return handle(e);
    } catch (error) {
      dead = true;
      setImmediate(() => {
        tap.remove();
        onFault(error);
      });
      return false;
    }
  }, kind);
  return {
    uninstall() {
      dead = true;
      tap.remove();
    },
  };
}

export function installTapHook(native: MacNative, onKey: (key: HookKey) => boolean, onFault: (error: unknown) => void): InstalledHook {
  return installTap(
    native,
    {
      kind: "keys",
      handle: (e) => {
        const vk = vkOfMacKey(e.keycode);
        const extra = e.userData;
        const flags = extra === OWN_EVENT_MARKER ? INJECTED : 0;
        if (e.type === FLAGS_CHANGED) {
          const down = modifierDown(e.keycode, e.flags);
          return down === null ? false : onKey({ vk, flags, extra, down });
        }
        if (e.type !== KEY_DOWN && e.type !== KEY_UP) return false;
        return onKey({ vk, flags, extra, down: e.type === KEY_DOWN });
      },
    },
    onFault,
  );
}

/** The mouse button tap: buttons only (moves and the wheel are not in its mask), same contract as the key tap. */
export function installMouseTapHook(native: MacNative, onClick: (click: HookClick) => boolean, onFault: (error: unknown) => void): InstalledHook {
  return installTap(
    native,
    {
      kind: "mouse",
      handle: (e) => {
        const b = mouseButtonOf(e.type, e.button);
        return b ? onClick({ ...b, extra: e.userData, flags: 0 }) : false;
      },
    },
    onFault,
  );
}
