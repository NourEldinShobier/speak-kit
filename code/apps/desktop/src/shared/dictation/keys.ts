/** Hotkeys are stored as KeyboardEvent.code names joined with "+": "ControlRight", "ControlLeft+AltLeft+Space". Pure, shared by main and renderer. */

const MODIFIERS = { ShiftLeft: 0xa0, ShiftRight: 0xa1, ControlLeft: 0xa2, ControlRight: 0xa3, AltLeft: 0xa4, AltRight: 0xa5, MetaLeft: 0x5b, MetaRight: 0x5c } as const;

const build = () => {
  // Home, End, Page Up and Page Down carry the extended offset (0x100) the hook adds for the dedicated keys, so the numpad keys with Num Lock off never match.
  const vk: Record<string, number> = {
    ...MODIFIERS,
    Space: 0x20,
    CapsLock: 0x14,
    Pause: 0x13,
    ScrollLock: 0x91,
    Insert: 0x2d,
    Backquote: 0xc0,
    Tab: 0x09,
    PageUp: 0x121,
    PageDown: 0x122,
    End: 0x123,
    Home: 0x124,
  };
  for (let n = 1; n <= 24; n++) vk[`F${n}`] = 0x70 + n - 1;
  for (let c = 0; c < 26; c++) vk[`Key${String.fromCharCode(65 + c)}`] = 0x41 + c;
  for (let d = 0; d < 10; d++) vk[`Digit${d}`] = 0x30 + d;
  return vk;
};

/** Key code to Windows virtual-key code. Escape is not here: it cancels, it cannot be the hotkey. */
export const KEY_VK: Readonly<Record<string, number>> = build();
const VK_KEY = new Map(Object.entries(KEY_VK).map(([k, v]) => [v, k]));

/** Right Control does not exist on a MacBook keyboard; Right Option does. */
export const defaultHotkey = (platform: string): string => (platform === "darwin" ? "AltRight" : "ControlRight");
export const DEFAULT_HOTKEY = defaultHotkey(typeof process === "undefined" ? "win32" : process.platform);
/** Where Paste last starts out. */
export const DEFAULT_PASTE_LAST = "ControlLeft+AltLeft+KeyV";
/** Home, End, Page Up and Page Down work as a whole shortcut, but they type nothing and move the cursor in every app, so the recorder warns before it saves them. */
export const ADVANCED_KEYS: readonly string[] = ["Home", "End", "PageUp", "PageDown"];
export const usesAdvancedKey = (hotkey: string): boolean => hotkeyKeys(hotkey).some((k) => ADVANCED_KEYS.includes(k));
/** A key this app cannot match (the recorder says "Unsupported key" instead of ignoring it). Escape is the cancel key, not a hotkey. */
export const unsupportedKey = (code: string): boolean => !(code in KEY_VK);

/** Cancel keys: Escape (the default) or any single key a hotkey can be. */
export const validCancelKey = (code: string): boolean => code === CANCEL_KEY || (code in KEY_VK && !(code in MODIFIERS));
export const cancelVk = (code: string): number => (code === CANCEL_KEY ? 0x1b : (KEY_VK[code] ?? 0x1b));
export const MAX_CHORD_KEYS = 3;
export const CANCEL_KEY = "Escape";

/** Key code for a virtual-key code; a code this table does not know gets a stable made-up name, so the session still tells keys apart. */
export const keyOfVk = (vk: number): string => VK_KEY.get(vk) ?? `Vk${vk}`;

export const hotkeyKeys = (hotkey: string): string[] => hotkey.split("+");

/** A key that is safe to be the whole hotkey: a modifier, a function key or a key typing never uses. Letters, digits and Space alone are not. */
const standsAlone = (code: string) => code in MODIFIERS || /^F\d+$/.test(code) || ["Pause", "ScrollLock", "Insert", "CapsLock", ...ADVANCED_KEYS].includes(code);

/** A learned mouse button, or one to three known, different keys; a single key must be one that stands alone, a chord needs a modifier or such a key in it. */
export function validHotkey(hotkey: string): boolean {
  if (isLogiHotkey(hotkey)) return true;
  const keys = hotkeyKeys(hotkey);
  return keys.length <= MAX_CHORD_KEYS && new Set(keys).size === keys.length && keys.every((k) => k in KEY_VK) && keys.some(standsAlone) && (keys.length > 1 || standsAlone(keys[0]!));
}

const MAC_LABELS: Record<string, string> = {
  ControlLeft: "Control",
  ControlRight: "Right Control",
  AltLeft: "Option",
  AltRight: "Right Option",
  MetaLeft: "Command",
  MetaRight: "Right Command",
};
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
  PageUp: "Page Up",
  PageDown: "Page Down",
};
const ORDER = ["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"];

export const keyLabel = (code: string, platform = "win32"): string => {
  const cid = logiCid(code);
  if (cid !== undefined) return logiLabel(cid);
  return (platform === "darwin" ? MAC_LABELS[code] : undefined) ?? LABELS[code] ?? code.replace(/^Key|^Digit/, "");
};

/** The hotkey as chips: modifiers first (Ctrl, Alt, Shift, Win), then the rest. */
export function hotkeyLabels(hotkey: string, platform = "win32"): string[] {
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
  return hotkeyKeys(hotkey)
    .sort((a, b) => rank(a) - rank(b))
    .map((k) => keyLabel(k, platform));
}

/** "Ctrl Alt Space", for sentences. */
export const hotkeyText = (hotkey: string, platform = "win32"): string => hotkeyLabels(hotkey, platform).join(" ");

/** Stores a set of pressed key codes as a hotkey, or null when it is not an allowed one. */
export function hotkeyFrom(codes: readonly string[]): string | null {
  const keys = [...new Set(codes)].sort((a, b) => (ORDER.includes(a) ? ORDER.indexOf(a) : 99) - (ORDER.includes(b) ? ORDER.indexOf(b) : 99));
  const h = keys.join("+");
  return validHotkey(h) ? h : null;
}

/** A Logitech mouse button the app learned is stored as "logi:0x00c3" (the control id of the button), in place of keys. */
const LOGI_ID = /^logi:0x([0-9a-f]{4})$/;
export const logiHotkey = (cid: number): string => `logi:0x${cid.toString(16).padStart(4, "0")}`;
export const isLogiHotkey = (hotkey: string): boolean => LOGI_ID.test(hotkey);
/** The control id of a stored button, or undefined when the shortcut is made of keys. */
export const logiCid = (hotkey: string): number | undefined => {
  const m = LOGI_ID.exec(hotkey);
  return m ? parseInt(m[1]!, 16) : undefined;
};
/** The buttons Logitech mice have in common; any other control reads "Button 0x01a0". */
const LOGI_NAMES: Record<number, string> = { 0x52: "Middle button", 0x53: "Back button", 0x56: "Forward button", 0xc3: "Gesture button", 0xc4: "Smart Shift button", 0xd7: "DPI button" };
export const logiLabel = (cid: number): string => LOGI_NAMES[cid] ?? `Button ${logiHotkey(cid).slice(5)}`;
