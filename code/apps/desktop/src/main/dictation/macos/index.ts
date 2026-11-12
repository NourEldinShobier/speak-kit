import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createKeyboardHook } from "../keyboard-hook";
import type { DictationPlatform } from "../types";
import { installMouseTapHook, installTapHook } from "./hook";
import { createMacInput } from "./input";
import { createMacLayoutReader, type RunText } from "./layout-reader";
import { macKeyOfVk, OWN_EVENT_MARKER } from "./keymap";
import { loadMacNative, type MacNative } from "./native";

/** The macOS platform over a native binding; tests pass a fake one. */
export function createMacPlatformWith(native: MacNative, layout?: { current(): string | undefined }): DictationPlatform {
  const hotkey = createKeyboardHook(
    {
      install: (onKey, onFault) => installTapHook(native, onKey, onFault),
      installMouse: (onClick, onFault) => installMouseTapHook(native, onClick, onFault),
      keyIsDown: (vk) => {
        const code = macKeyOfVk(vk);
        return code !== undefined && native.keyIsDown(code);
      },
    },
    { marker: OWN_EVENT_MARKER },
  );
  return { supported: true, hotkey, input: createMacInput(native, layout), dispose: () => hotkey.stop() };
}

export async function createMacPlatform(): Promise<DictationPlatform> {
  const run: RunText = (file, args) => promisify(execFile)(file, [...args], { timeout: 2000 }).then((r) => String(r.stdout));
  return createMacPlatformWith(await loadMacNative(), createMacLayoutReader(run, Date.now));
}
