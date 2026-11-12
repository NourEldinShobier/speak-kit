import { createKeyboardHook } from "../keyboard-hook";
import type { DictationPlatform } from "../types";
import { createForeground } from "./foreground";
import { installKeyboardHook } from "./hook";
import { createInput, OWN_INPUT_MARKER } from "./input";
import { installMouseHook } from "./mouse-hook";
import { loadWin32 } from "./native";

/** A key no program uses; pressing it while Alt or Win is down tells the system the key was used, so releasing it opens no menu. */
const MASK_VK = 0xe8;

export async function createWindowsPlatform(): Promise<DictationPlatform> {
  const w = await loadWin32();
  const key = (flags: number) => ({ type: 1 as const, u: { ki: { wVk: MASK_VK, wScan: 0, dwFlags: flags, time: 0 as const, dwExtraInfo: OWN_INPUT_MARKER } } });
  const hotkey = createKeyboardHook(
    {
      install: (onKey, onFault) => installKeyboardHook(w, onKey, onFault),
      installMouse: (onClick, onFault) => installMouseHook(w, onClick, onFault),
      keyIsDown: w.keyIsDown,
      injectMask: () => void w.sendInput([key(0), key(0x2)]),
    },
    { marker: OWN_INPUT_MARKER },
  );
  return { supported: true, hotkey, input: createInput(w, createForeground(w)), dispose: () => hotkey.stop() };
}
