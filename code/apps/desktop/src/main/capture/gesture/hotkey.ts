import { hotkeyKeys, KEY_VK } from "../../../shared/dictation/keys";
import { VK, type HotkeyEvent, type HotkeySource } from "../../dictation/types";
import type { GestureEvent } from "./index";

export type HotkeyStart = { ok: true } | { ok: false; reason: "invalid-hotkey" | "unsupported-platform" | "hook-failed" | "already-running" };

export interface CaptureHotkey {
  start(hotkey: string, onEvent: (e: GestureEvent) => void): HotkeyStart;
  stop(): void;
  /** Forgets keys believed down (screen lock, sleep). */
  resync(): void;
  readonly active: boolean;
}

/** The capture key from the operating system's key hook: the chord's press and release, and Esc while the chord is held. */
export function captureHotkey(source: HotkeySource): CaptureHotkey {
  const toGesture = (e: HotkeyEvent): GestureEvent | undefined => {
    if (e.kind === "down") return { kind: "down" };
    if (e.kind === "up") return { kind: "up" };
    if ((e.kind === "other" || e.kind === "grabbed") && e.vk === VK.escape) return { kind: "escape" };
    return undefined;
  };
  return {
    get active() {
      return source.active;
    },
    start(hotkey, onEvent) {
      const keys = hotkeyKeys(hotkey).map((k) => KEY_VK[k]);
      if (!keys.length || keys.some((k) => k === undefined)) return { ok: false, reason: "invalid-hotkey" };
      return source.start(
        { keys: keys as number[] },
        {
          onEvent(e) {
            const g = toGesture(e);
            if (g) onEvent(g);
          },
        },
      );
    },
    stop: () => source.stop(),
    resync: () => source.resync(),
  };
}
