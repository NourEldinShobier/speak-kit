import type { DictationPlatform } from "./types";

/** Platforms without a key hook and key injection yet (macOS, Linux): the hotkey refuses to start and dictation only copies text to the clipboard. */
export function createUnsupportedPlatform(): DictationPlatform {
  return {
    supported: false,
    hotkey: { active: false, start: () => ({ ok: false, reason: "unsupported-platform" }), stop() {}, grab() {}, resync() {} },
    input: { foreground: () => null, passwordFocused: () => false, heldModifiers: () => [], pressPaste: () => false, type: () => false, clipboardSequence: () => 0 },
    dispose() {},
  };
}
