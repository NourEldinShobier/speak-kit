import { createKeyboardHook } from "../keyboard-hook";
import type { DictationPlatform } from "../types";
import { installTapHook } from "./hook";
import { createMacInput } from "./input";
import { macKeyOfVk, OWN_EVENT_MARKER } from "./keymap";
import { loadMacNative, type MacNative } from "./native";

/** The macOS platform over a native binding; tests pass a fake one. */
export function createMacPlatformWith(native: MacNative): DictationPlatform {
  const hotkey = createKeyboardHook(
    {
      install: (onKey, onFault) => installTapHook(native, onKey, onFault),
      keyIsDown: (vk) => {
        const code = macKeyOfVk(vk);
        return code !== undefined && native.keyIsDown(code);
      },
    },
    { marker: OWN_EVENT_MARKER },
  );
  return { supported: true, hotkey, input: createMacInput(native), dispose: () => hotkey.stop() };
}

export async function createMacPlatform(): Promise<DictationPlatform> {
  return createMacPlatformWith(await loadMacNative());
}
