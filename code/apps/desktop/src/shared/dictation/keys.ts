/** Hotkeys are stored as KeyboardEvent.code names joined with "+": "ControlRight", "ControlLeft+AltLeft+Space". Pure, shared by main and renderer. */

const MODIFIERS = { ShiftLeft: 0xa0, ShiftRight: 0xa1, ControlLeft: 0xa2, ControlRight: 0xa3, AltLeft: 0xa4, AltRight: 0xa5, MetaLeft: 0x5b, MetaRight: 0x5c } as const;

const build = () => {
  // Home, End, Page Up and Page Down carry the extended offset (0x100) the hook adds for the dedicated keys, so the numpad keys with Num Lock off never match. Mouse buttons use their own virtual-key codes.
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
    Mouse2: 0x02,
    Mouse3: 0x04,
    Mouse4: 0x05,
    Mouse5: 0x06,
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
/** Home, End, Page Up and Page Down work as a whole shortcut, but they type nothing and move the cursor in every app, so they sit behind the advanced options with a warning. */
export const ADVANCED_KEYS: readonly string[] = ["Home", "End", "PageUp", "PageDown"];
export const MOUSE_KEYS: readonly string[] = ["Mouse2", "Mouse3", "Mouse4", "Mouse5"];
export const isMouseKey = (code: string): boolean => MOUSE_KEYS.includes(code);
export const usesAdvancedKey = (hotkey: string): boolean => hotkeyKeys(hotkey).some((k) => ADVANCED_KEYS.includes(k));
/** A key this app cannot match (the recorder says "Unsupported key" instead of ignoring it). Escape is the cancel key, not a hotkey. */
export const unsupportedKey = (code: string): boolean => !(code in KEY_VK);

/** Cancel keys: Escape (the default) or any single key a hotkey can be. */
export const validCancelKey = (code: string): boolean => code === CANCEL_KEY || (code in KEY_VK && !isMouseKey(code) && !(code in MODIFIERS));
export const cancelVk = (code: string): number => (code === CANCEL_KEY ? 0x1b : (KEY_VK[code] ?? 0x1b));
export const MAX_CHORD_KEYS = 3;
export const CANCEL_KEY = "Escape";

/** Key code for a virtual-key code; a code this table does not know gets a stable made-up name, so the session still tells keys apart. */
export const keyOfVk = (vk: number): string => VK_KEY.get(vk) ?? `Vk${vk}`;

export const hotkeyKeys = (hotkey: string): string[] => hotkey.split("+");

/** A key that is safe to be the whole hotkey: a modifier, a function key or a key typing never uses. Letters, digits and Space alone are not. */
const standsAlone = (code: string) => code in MODIFIERS || /^F\d+$/.test(code) || ["Pause", "ScrollLock", "Insert", "CapsLock", ...ADVANCED_KEYS, ...MOUSE_KEYS].includes(code);

/** One to three known, different keys; a single key must be one that stands alone, a chord needs a modifier or such a key in it. */
export function validHotkey(hotkey: string): boolean {
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
  Mouse2: "Mouse 2",
  Mouse3: "Mouse 3",
  Mouse4: "Mouse 4",
  Mouse5: "Mouse 5",
};
const ORDER = ["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"];

export const keyLabel = (code: string, platform = "win32"): string => (platform === "darwin" ? MAC_LABELS[code] : undefined) ?? LABELS[code] ?? code.replace(/^Key|^Digit/, "");

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
