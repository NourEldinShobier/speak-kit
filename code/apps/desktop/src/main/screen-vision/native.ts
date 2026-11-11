import type { Rect } from "./plan";

/** The two window calls the window scope needs. Loaded on first use; Windows only. */
export interface WindowApi {
  /** Handle of the window the user is typing into, or 0. */
  foreground(): number;
  /** Where a window is, in pixels of the desktop: the visible frame (without the invisible resize border), or the plain window rectangle. */
  bounds(handle: number): Rect | undefined;
}

interface RawRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;

export async function loadWindowApi(): Promise<WindowApi> {
  const koffi = (await import("koffi")).default;
  koffi.struct("SkScreenRect", { left: "long", top: "long", right: "long", bottom: "long" });
  const user32 = koffi.load("user32.dll");
  const dwm = koffi.load("dwmapi.dll");
  const getForeground = user32.func("intptr_t __stdcall GetForegroundWindow()");
  const getRect = user32.func("bool __stdcall GetWindowRect(intptr_t hWnd, _Out_ SkScreenRect *rect)");
  const frame = dwm.func("int32 __stdcall DwmGetWindowAttribute(intptr_t hWnd, uint32 attr, _Out_ SkScreenRect *value, uint32 size)");
  const toRect = (r: RawRect): Rect => ({ x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top });
  return {
    foreground: () => Number(getForeground()),
    bounds(handle) {
      const r = {} as RawRect;
      if (frame(handle, DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) === 0) return toRect(r);
      return getRect(handle, r) ? toRect(r) : undefined;
    },
  };
}
