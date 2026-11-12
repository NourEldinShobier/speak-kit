import { hotkeyFrom, unsupportedKey, usesAdvancedKey } from "./keys";

/** Why a set of keys or a click cannot become a shortcut. The recorder shows the matching line. */
export type Refusal = "unsupported" | "altgr" | "needs-key" | "too-many" | "left-click";

export type Recorded = { ok: true; hotkey: string; advanced: boolean } | { ok: false; refusal: Refusal };

export const REFUSAL_TEXT: Record<Refusal, string> = {
  unsupported: "Unsupported key",
  altgr: "Right Alt is AltGr on this keyboard layout and types characters. Pick another key.",
  "needs-key": "Use a modifier such as Ctrl, or a key such as F9.",
  "too-many": "Use at most three keys.",
  "left-click": "The left button cannot be a shortcut. Pick Mouse 2 to 5.",
};

/**
 * What the keys held together mean as a shortcut. `altGraph` is true when the keyboard reported the AltGr state while the keys were down
 * (the browser says so only on layouts where Right Alt is AltGr), because a lone Right Alt there is Ctrl+Alt and types text.
 */
export function interpretKeys(codes: readonly string[], ctx: { altGraph: boolean }): Recorded {
  const keys = [...new Set(codes)];
  if (keys.some(unsupportedKey)) return { ok: false, refusal: "unsupported" };
  if (ctx.altGraph && keys.includes("AltRight") && keys.every((k) => k === "AltRight" || k === "ControlLeft")) return { ok: false, refusal: "altgr" };
  if (keys.length > 3) return { ok: false, refusal: "too-many" };
  const hotkey = hotkeyFrom(keys);
  return hotkey ? { ok: true, hotkey, advanced: usesAdvancedKey(hotkey) } : { ok: false, refusal: "needs-key" };
}

/** A mouse button from `MouseEvent.button` (0 left, 1 middle, 2 right, 3 back, 4 forward) as a key code, or a refusal for the left button. */
export function interpretButton(button: number): { ok: true; key: string } | { ok: false; refusal: Refusal } {
  if (button === 0) return { ok: false, refusal: "left-click" };
  const key = ({ 1: "Mouse3", 2: "Mouse2", 3: "Mouse4", 4: "Mouse5" } as Record<number, string | undefined>)[button];
  return key ? { ok: true, key } : { ok: false, refusal: "unsupported" };
}
