// CGEventType values of button presses and releases (left, right, other).
const DOWN = new Set([1, 3, 25]);
const UP = new Set([2, 4, 26]);
// Mouse button number (CGMouseButton) to the virtual-key code the chord tracker uses: left 0x01, right 0x02, middle 0x04, side buttons 0x05 and 0x06.
const VK = [0x01, 0x02, 0x04, 0x05, 0x06];

/** The button change of a mouse event, or undefined for anything else (moves, drags, the wheel and buttons beyond the fifth). */
export function mouseButtonOf(type: number, button: number): { vk: number; down: boolean } | undefined {
  const vk = VK[button];
  if (vk === undefined || (!DOWN.has(type) && !UP.has(type))) return undefined;
  return { vk, down: DOWN.has(type) };
}
