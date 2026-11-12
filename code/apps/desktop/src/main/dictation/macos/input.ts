import { CLIPBOARD_PRIVACY_MARKS, type ForegroundInfo, type InputPort } from "../types";
import { FLAG_ALT, FLAG_COMMAND, FLAG_SHIFT, MAC_KEY_RETURN, MAC_KEY_V } from "./keymap";
import type { MacNative } from "./native";

// CGEventKeyboardSetUnicodeString takes at most 20 UTF-16 units per event.
const UNITS_PER_EVENT = 20;
const FILE_TYPES = ["public.file-url", "NSFilenamesPboardType"];

// The pasteboard convention that tells clipboard managers to skip an entry, and which Windows privacy marks each type stands for.
const CONCEALED = "org.nspasteboard.ConcealedType";
const TRANSIENT = "org.nspasteboard.TransientType";
const MARK_TYPE: Readonly<Record<string, string>> = {
  ExcludeClipboardContentFromMonitorProcessing: CONCEALED,
  CanIncludeInClipboardHistory: TRANSIENT,
  CanUploadToCloudClipboard: TRANSIENT,
};

/** Text as chunks of whole characters: a surrogate pair never splits across two events. */
export function chunks(text: string): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  for (const ch of text) {
    const units = Array.from({ length: ch.length }, (_, i) => ch.charCodeAt(i));
    if (cur.length + units.length > UNITS_PER_EVENT) {
      out.push(cur);
      cur = [];
    }
    cur.push(...units);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** How long to wait for an app to come to the front, and how often to look. */
const FOCUS_WAIT_MS = 500;
const FOCUS_POLL_MS = 25;

/** Brings the app with this process id to the front and waits up to half a second for the system to agree. */
async function focusApp(native: MacNative, pid: number): Promise<boolean> {
  if (native.frontmost()?.pid === pid) return true;
  if (!native.activate(pid)) return false;
  for (let waited = 0; waited <= FOCUS_WAIT_MS; waited += FOCUS_POLL_MS) {
    if (native.frontmost()?.pid === pid) return true;
    await new Promise((r) => setTimeout(r, FOCUS_POLL_MS));
  }
  return false;
}

export function createMacInput(native: MacNative): InputPort {
  const press = (code: number, flags: number) => native.postKey(code, true, flags) && native.postKey(code, false, flags);
  return {
    foreground(): ForegroundInfo | null {
      const f = native.frontmost();
      // The window is not told apart from its app: a window switch inside one app goes unnoticed, an app switch does not.
      return f ? { hwnd: String(f.pid), pid: f.pid, exe: f.bundleId ?? f.name, className: "", elevated: false } : null;
    },
    // Which control has focus needs Accessibility queries; secure input is the signal password fields give without them.
    passwordFocused: () => false,
    secureInput: () => native.secureInput(),
    heldModifiers() {
      const flags = native.modifierFlags();
      const held: Array<[string, number]> = [
        ["shift", FLAG_SHIFT],
        ["alt", FLAG_ALT],
        ["win", FLAG_COMMAND],
      ];
      return held.filter(([, bit]) => (flags & bit) !== 0).map(([name]) => name);
    },
    // Command stands in for Ctrl; Shift+Insert has no Mac key, so it is the plain paste.
    pressPaste(key) {
      const flags = FLAG_COMMAND | (key === "ctrl-shift-v" ? FLAG_SHIFT : 0);
      if (press(MAC_KEY_V, flags)) return true;
      native.postKey(MAC_KEY_V, false, flags); // never leave the key down
      return false;
    },
    focus: (hwnd) => focusApp(native, Number(hwnd)),
    type(text) {
      const lines = text.replaceAll("\r\n", "\n").split("\n");
      for (const [i, line] of lines.entries()) {
        if (i > 0 && !press(MAC_KEY_RETURN, 0)) return false;
        for (const c of chunks(line)) if (!native.postUnits(c)) return false;
      }
      return true;
    },
    clipboardSequence: () => native.pasteboard.changeCount(),
    clipboardTraits() {
      const types = native.pasteboard.types();
      const concealed = types.includes(CONCEALED);
      const transient = types.includes(TRANSIENT);
      const marks = CLIPBOARD_PRIVACY_MARKS.filter((m) => (MARK_TYPE[m] === CONCEALED ? concealed : transient));
      return { files: types.some((t) => FILE_TYPES.includes(t)), formats: types.length, marks };
    },
    async markClipboard(marks) {
      const types = [...new Set(marks.flatMap((m) => MARK_TYPE[m] ?? []))];
      return types.length === 0 || native.pasteboard.addTypes(types);
    },
  };
}
