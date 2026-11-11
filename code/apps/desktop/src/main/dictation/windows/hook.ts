import type { HookKey, InstalledHook } from "../keyboard-hook";
import type { RawKbd, Win32 } from "./native";

const WM_KEYDOWN = 0x100;
const WM_SYSKEYDOWN = 0x104;

/**
 * Installs the low-level keyboard hook. `onKey` runs inside the hook callback, which Windows waits for before it delivers the key, so it must only
 * decide: return true to swallow the key. If it throws, the key is passed on, the hook is removed at once (the keyboard keeps working as if it
 * was never installed) and `onFault` is called from the event loop afterwards. Throws when Windows refuses the hook.
 */
export function installKeyboardHook(w: Win32, onKey: (key: HookKey) => boolean, onFault: (error: unknown) => void): InstalledHook {
  const { koffi, hook } = w;
  let handle: ReturnType<Win32["hook"]["install"]> = null;
  let dead = false;

  const remove = () => {
    if (dead) return;
    dead = true;
    w.hook.remove(handle);
    // The callback may still be on the stack when this runs from inside it; koffi must not drop it before it returns.
    setImmediate(() => koffi.unregister(registered));
  };

  const registered = koffi.register((code: number, wParam: number, lParam: unknown) => {
    if (dead || code < 0) return hook.callNext(code, wParam, lParam);
    try {
      const raw = koffi.decode(lParam, hook.kbdStruct) as RawKbd;
      if (onKey({ ...raw, down: wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN })) return 1;
    } catch (error) {
      remove();
      setImmediate(() => onFault(error));
    }
    return hook.callNext(code, wParam, lParam);
  }, koffi.pointer(hook.callbackType));

  handle = hook.install(registered);
  if (!handle) {
    dead = true;
    koffi.unregister(registered);
    throw new Error("SetWindowsHookEx refused the keyboard hook");
  }
  return { uninstall: remove };
}
