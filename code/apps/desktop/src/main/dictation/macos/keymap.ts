import { VK, type VirtualKey } from "../types";

/** Put in the user-data field of every key event this app posts, so its own event tap lets them through untouched. */
export const OWN_EVENT_MARKER = 0x53504b54;

/** Unknown mac key codes get a number above every Windows code, so the chord tracker still tells keys apart. */
const UNKNOWN_BASE = 0x1000;

// Mac key codes (Carbon kVK_*, ANSI layout positions) to the Windows virtual-key codes the hotkey chords are stored in.
const LETTERS: ReadonlyArray<[mac: number, letter: string]> = [
  [0, "A"],
  [11, "B"],
  [8, "C"],
  [2, "D"],
  [14, "E"],
  [3, "F"],
  [5, "G"],
  [4, "H"],
  [34, "I"],
  [38, "J"],
  [40, "K"],
  [37, "L"],
  [46, "M"],
  [45, "N"],
  [31, "O"],
  [35, "P"],
  [12, "Q"],
  [15, "R"],
  [1, "S"],
  [17, "T"],
  [32, "U"],
  [9, "V"],
  [13, "W"],
  [7, "X"],
  [16, "Y"],
  [6, "Z"],
];
const DIGITS: ReadonlyArray<[mac: number, digit: number]> = [
  [29, 0],
  [18, 1],
  [19, 2],
  [20, 3],
  [21, 4],
  [23, 5],
  [22, 6],
  [26, 7],
  [28, 8],
  [25, 9],
];
const FKEYS: ReadonlyArray<number> = [122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111, 105, 107, 113, 106, 64, 79, 80, 90]; // F1..F20

const PAIRS: Array<[number, VirtualKey]> = [
  [49, VK.space],
  [53, VK.escape],
  [48, 0x09],
  [50, 0xc0],
  [57, VK.capsLock],
  [36, 0x0d],
  [51, 0x08],
  [114, 0x2d],
  [56, VK.leftShift],
  [60, VK.rightShift],
  [59, VK.leftCtrl],
  [62, VK.rightCtrl],
  [58, VK.leftAlt],
  [61, VK.rightAlt],
  [55, VK.leftWin],
  [54, VK.rightWin],
  ...LETTERS.map(([mac, l]) => [mac, l.charCodeAt(0)] as [number, VirtualKey]),
  ...DIGITS.map(([mac, d]) => [mac, 0x30 + d] as [number, VirtualKey]),
  ...FKEYS.map((mac, i) => [mac, 0x70 + i] as [number, VirtualKey]),
];

const TO_VK = new Map<number, VirtualKey>(PAIRS);
const TO_MAC = new Map<VirtualKey, number>(PAIRS.map(([m, v]) => [v, m]));

export const vkOfMacKey = (code: number): VirtualKey => TO_VK.get(code) ?? UNKNOWN_BASE + code;
export const macKeyOfVk = (vk: VirtualKey): number | undefined => TO_MAC.get(vk) ?? (vk >= UNKNOWN_BASE ? vk - UNKNOWN_BASE : undefined);

/** Mac key code of V, for the paste shortcut. */
export const MAC_KEY_V = 9;
export const MAC_KEY_RETURN = 36;

// Device-dependent flag bit of each modifier key: a flags-changed event carries the key code, the bit says whether that key is down now.
const MODIFIER_BIT: Readonly<Record<number, number>> = {
  56: 0x2,
  60: 0x4,
  59: 0x1,
  62: 0x2000,
  58: 0x20,
  61: 0x40,
  55: 0x8,
  54: 0x10,
  57: 0x10000,
};

/** Whether a flags-changed event for this key code means the key went down; null for a key that is not a tracked modifier. */
export function modifierDown(code: number, flags: number): boolean | null {
  const bit = MODIFIER_BIT[code];
  return bit === undefined ? null : (flags & bit) !== 0;
}

// Generic modifier masks (CGEventFlags) for synthesized key events and for reading what is held.
export const FLAG_SHIFT = 0x20000;
export const FLAG_ALT = 0x80000;
export const FLAG_COMMAND = 0x100000;
