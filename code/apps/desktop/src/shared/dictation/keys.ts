/** Hotkeys are stored as KeyboardEvent.code names joined with "+": "ControlRight", "ControlLeft+AltLeft+Space". Pure, shared by main and renderer. */

const MODIFIERS = { ShiftLeft: 0xa0, ShiftRight: 0xa1, ControlLeft: 0xa2, ControlRight: 0xa3, AltLeft: 0xa4, AltRight: 0xa5, MetaLeft: 0x5b, MetaRight: 0x5c } as const;

const build = () => {
  const vk: Record<string, number> = { ...MODIFIERS, Space: 0x20, CapsLock: 0x14, Pause: 0x13, ScrollLock: 0x91, Insert: 0x2d, Backquote: 0xc0, Tab: 0x09 };
  for (let n = 1; n <= 24; n++) vk[`F${n}`] = 0x70 + n - 1;
  for (let c = 0; c < 26; c++) vk[`Key${String.fromCharCode(65 + c)}`] = 0x41 + c;
  for (let d = 0; d < 10; d++) vk[`Digit${d}`] = 0x30 + d;
  return vk;
};

/** Key code to Windows virtual-key code. Escape is not here: it cancels, it cannot be the hotkey. */
export const KEY_VK: Readonly<Record<string, number>> = build();
const VK_KEY = new Map(Object.entries(KEY_VK).map(([k, v]) => [v, k]));

export const DEFAULT_HOTKEY = "ControlRight";
export const MAX_CHORD_KEYS = 3;
export const CANCEL_KEY = "Escape";

/** Key code for a virtual-key code; a code this table does not know gets a stable made-up name, so the session still tells keys apart. */
export const keyOfVk = (vk: number): string => VK_KEY.get(vk) ?? `Vk${vk}`;

export const hotkeyKeys = (hotkey: string): string[] => hotkey.split("+");

/** A key that is safe to be the whole hotkey: a modifier, a function key or a key typing never uses. Letters, digits and Space alone are not. */
const standsAlone = (code: string) => code in MODIFIERS || /^F\d+$/.test(code) || ["Pause", "ScrollLock", "Insert", "CapsLock"].includes(code);

/** One to three known, different keys; a single key must be one that stands alone, a chord needs a modifier or such a key in it. */
export function validHotkey(hotkey: string): boolean {
  const keys = hotkeyKeys(hotkey);
  return keys.length <= MAX_CHORD_KEYS && new Set(keys).size === keys.length && keys.every((k) => k in KEY_VK) && keys.some(standsAlone) && (keys.length > 1 || standsAlone(keys[0]!));
}

const LABELS: Record<string, string> = {
  ControlLeft: "Ctrl",
  ControlRight: "Right Ctrl",
  AltLeft: "Alt",
  AltRight: "Right Alt",
  ShiftLeft: "Shift",
  ShiftRight: "Right Shift",
  MetaLeft: "Win",
  MetaRight: "Right Win",
  Backquote: "`",
};
const ORDER = ["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"];

export const keyLabel = (code: string): string => LABELS[code] ?? code.replace(/^Key|^Digit/, "");

/** The hotkey as chips: modifiers first (Ctrl, Alt, Shift, Win), then the rest. */
export function hotkeyLabels(hotkey: string): string[] {
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
  return hotkeyKeys(hotkey)
    .sort((a, b) => rank(a) - rank(b))
    .map(keyLabel);
}

/** "Ctrl Alt Space", for sentences. */
export const hotkeyText = (hotkey: string): string => hotkeyLabels(hotkey).join(" ");

/** Stores a set of pressed key codes as a hotkey, or null when it is not an allowed one. */
export function hotkeyFrom(codes: readonly string[]): string | null {
  const keys = [...new Set(codes)].sort((a, b) => (ORDER.includes(a) ? ORDER.indexOf(a) : 99) - (ORDER.includes(b) ? ORDER.indexOf(b) : 99));
  const h = keys.join("+");
  return validHotkey(h) ? h : null;
}
