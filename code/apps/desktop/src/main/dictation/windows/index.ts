import { createKeyboardHook } from "../keyboard-hook";
import type { DictationPlatform } from "../types";
import { createForeground } from "./foreground";
import { installKeyboardHook } from "./hook";
import { createInput, OWN_INPUT_MARKER } from "./input";
import { loadWin32 } from "./native";

export async function createWindowsPlatform(): Promise<DictationPlatform> {
  const w = await loadWin32();
  const hotkey = createKeyboardHook({ install: (onKey, onFault) => installKeyboardHook(w, onKey, onFault), keyIsDown: w.keyIsDown }, { marker: OWN_INPUT_MARKER });
  return { supported: true, hotkey, input: createInput(w, createForeground(w)), dispose: () => hotkey.stop() };
}
