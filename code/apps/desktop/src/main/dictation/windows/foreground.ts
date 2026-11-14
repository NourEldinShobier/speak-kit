import type { ForegroundInfo } from "../types";
import { layoutCode } from "../../speech-models/layout";
import type { Win32 } from "./native";

const ES_PASSWORD = 0x20;

/** Which window the user is typing into, and whether the focused control is a password box. */
export function createForeground(w: Win32) {
  let selfElevated: boolean | undefined;
  const ownRights = () => (selfElevated ??= w.processInfo(process.pid).elevated === true);

  return {
    info(): ForegroundInfo | null {
      const h = w.foregroundWindow();
      if (!h) return null;
      const { pid } = w.windowOwner(h);
      const p = w.processInfo(pid);
      // A program whose token (or whole process) is closed to us runs with more rights than we do, which is what Windows needs to drop our key presses.
      const elevated = (p.elevated ?? true) && !ownRights();
      const layout = layoutCode(w.address(w.keyboardLayout(w.windowOwner(h).tid)));
      return { hwnd: w.address(h), pid, exe: p.exe, className: w.className(h), ...(layout && { layout }), elevated, bounds: w.windowBounds(h) };
    },
    /** Only classic edit controls (Win32, WinForms, RichEdit) carry the password style; browsers and other custom-drawn fields are not recognised. */
    passwordFocused(): boolean {
      const h = w.foregroundWindow();
      const focus = h ? w.focusedControl(w.windowOwner(h).tid) : null;
      return focus !== null && /edit/i.test(w.className(focus)) && (w.windowStyle(focus) & ES_PASSWORD) !== 0;
    },
  };
}

export type Foreground = ReturnType<typeof createForeground>;
