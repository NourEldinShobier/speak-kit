const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12; // Alt
const VK_C = 0x43;
const KEYUP = 2;

/**
 * Presses Ctrl+C in the focused window (Windows only). The global shortcut is still held when this runs, so Alt and Shift are
 * released first; otherwise the target app would see Ctrl+Alt+C. koffi is loaded on first use, so it costs nothing until a
 * selection is read.
 */
export async function sendCopyKeys(): Promise<void> {
  if (process.platform !== "win32") throw new Error("Reading the selection is only available on Windows.");
  const koffi = (await import("koffi")).default;
  const user32 = koffi.load("user32.dll");
  const keybd = user32.func("void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)");
  const down = user32.func("int16_t __stdcall GetAsyncKeyState(int vKey)");
  for (const vk of [VK_MENU, VK_SHIFT, VK_CONTROL]) if (down(vk) & 0x8000) keybd(vk, 0, KEYUP, 0);
  keybd(VK_CONTROL, 0, 0, 0);
  keybd(VK_C, 0, 0, 0);
  keybd(VK_C, 0, KEYUP, 0);
  keybd(VK_CONTROL, 0, KEYUP, 0);
}
