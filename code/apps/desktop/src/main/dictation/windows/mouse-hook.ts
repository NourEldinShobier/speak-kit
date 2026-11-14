import type { HookClick, InstalledHook } from "../keyboard-hook";
import type { RawMouse, Win32 } from "./native";

// Window messages of the buttons the hook cares about. Moves (0x200) and the wheel (0x20A) are passed on without being looked at.
const BUTTONS: Readonly<Record<number, { vk: number; down: boolean } | undefined>> = {
  0x201: { vk: 0x01, down: true },
  0x202: { vk: 0x01, down: false },
  0x204: { vk: 0x02, down: true },
  0x205: { vk: 0x02, down: false },
  0x207: { vk: 0x04, down: true },
  0x208: { vk: 0x04, down: false },
};
const WM_XBUTTONDOWN = 0x20b;
const WM_XBUTTONUP = 0x20c;

/** The code of a button message, or undefined for anything else. X buttons carry which one in the high word of mouseData. */
export function buttonOf(message: number, mouseData: number): { vk: number; down: boolean } | undefined {
  if (message === WM_XBUTTONDOWN || message === WM_XBUTTONUP) {
    const which = (mouseData >>> 16) & 0xffff;
    return which === 1 || which === 2 ? { vk: 0x04 + which, down: message === WM_XBUTTONDOWN } : undefined;
  }
  return BUTTONS[message];
}

/** Low-level mouse hook, same contract as the keyboard one: `onClick` only decides (true swallows), a throw removes the hook and reports the fault afterwards. */
export function installMouseHook(w: Win32, onClick: (click: HookClick) => boolean, onFault: (error: unknown) => void): InstalledHook {
  const { koffi, hook } = w;
  let handle: ReturnType<Win32["hook"]["install"]> = null;
  let dead = false;

  const remove = () => {
    if (dead) return;
    dead = true;
    w.hook.remove(handle);
    setImmediate(() => koffi.unregister(registered));
  };

  const registered = koffi.register((code: number, wParam: number, lParam: unknown) => {
    if (dead || code < 0) return hook.callNext(code, wParam, lParam);
    try {
      const raw = koffi.decode(lParam, hook.mouseStruct) as RawMouse;
      const b = buttonOf(wParam, raw.mouseData);
      if (b && onClick({ ...b, extra: raw.extra, flags: raw.flags })) return 1;
    } catch (error) {
      remove();
      setImmediate(() => onFault(error));
    }
    return hook.callNext(code, wParam, lParam);
  }, koffi.pointer(hook.callbackType));

  handle = hook.installMouse(registered);
  if (!handle) {
    dead = true;
    koffi.unregister(registered);
    throw new Error("SetWindowsHookEx refused the mouse hook");
  }
  return { uninstall: remove };
}
