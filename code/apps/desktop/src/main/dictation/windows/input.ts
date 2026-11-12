import { CLIPBOARD_PRIVACY_MARKS, VK, type InputPort } from "../types";
import type { Foreground } from "./foreground";
import type { KeyInput, Win32 } from "./native";

/** Put in `dwExtraInfo` of every key event this app injects, so its own keyboard hook lets them through untouched. */
export const OWN_INPUT_MARKER = 0x53504b54;

const KEYUP = 0x2;
const UNICODE = 0x4;
const SCANCODE = 0x8;
const VK_RETURN = 0x0d;
const TYPE_CHUNK = 128;
const CF_HDROP = 15;
// A copied file list: Explorer's, and virtual files (mail attachments) that have no CF_HDROP.
const FILE_FORMATS: readonly (number | string)[] = [CF_HDROP, "Shell IDList Array", "FileGroupDescriptorW"];

const MODIFIERS: ReadonlyArray<[name: string, vk: number]> = [
  ["shift", 0x10],
  ["alt", 0x12],
  ["win", VK.leftWin],
  ["win", VK.rightWin],
];

interface Press {
  vk: number;
  up: boolean;
  extended?: boolean;
}

const EXTENDED = 0x1;
const VK_INSERT = 0x2d;
/** How long to wait for a window to come to the front, and how often to look. */
const FOCUS_WAIT_MS = 500;
const FOCUS_POLL_MS = 25;

/** Another program may hold the clipboard open for a moment: try a few times, 10 ms apart. */
async function addWhenFree(w: Win32, marks: readonly string[]): Promise<boolean> {
  for (let tries = 0; tries < 5; tries++) {
    if (w.clipboardAdd(marks)) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

/** Brings a window to the front and waits up to half a second for Windows to agree. */
async function focusWindow(w: Win32, hwnd: string): Promise<boolean> {
  if (w.address(w.foregroundWindow()) === hwnd) return true;
  if (!w.setForeground(hwnd)) return false;
  for (let waited = 0; waited < FOCUS_WAIT_MS; waited += FOCUS_POLL_MS) {
    await new Promise((r) => setTimeout(r, FOCUS_POLL_MS));
    if (w.address(w.foregroundWindow()) === hwnd) return true;
  }
  return false;
}

export function createInput(w: Win32, fg: Foreground): InputPort {
  const event = (flags: number, vk: number, scan: number): KeyInput => ({ type: 1, u: { ki: { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: OWN_INPUT_MARKER } } });

  /** Scan codes from the focused window's layout: Chromium and terminals match physical keys, and a key without a scan code arrives as a raw control character there. */
  const press = (presses: Press[]): KeyInput[] => {
    const h = w.foregroundWindow();
    const layout = w.keyboardLayout(h ? w.windowOwner(h).tid : 0);
    return presses.map(({ vk, up, extended }) => {
      const scan = w.mapVirtualKey(vk, layout);
      return event((up ? KEYUP : 0) | (scan ? SCANCODE : 0) | (extended ? EXTENDED : 0), vk, scan);
    });
  };

  /** Sends everything in one call so the user's own typing cannot land in between. When the system takes only part, the keys it pressed are released again. */
  const sendAll = (presses: Press[]): boolean => {
    const events = press(presses);
    const taken = w.sendInput(events);
    if (taken === events.length) return true;
    const stillDown = presses.slice(0, taken).filter((p) => !p.up && !presses.slice(0, taken).some((q) => q.up && q.vk === p.vk));
    if (stillDown.length) w.sendInput(press(stillDown.map(({ vk }) => ({ vk, up: true }))));
    return false;
  };

  const unicode = (text: string): KeyInput[] =>
    [...text.replaceAll("\r\n", "\n")].flatMap((ch) =>
      ch === "\n"
        ? [event(0, VK_RETURN, 0), event(KEYUP, VK_RETURN, 0)]
        : Array.from({ length: ch.length }, (_, i) => ch.charCodeAt(i)).flatMap((unit) => [event(UNICODE, 0, unit), event(UNICODE | KEYUP, 0, unit)]),
    );

  return {
    foreground: () => fg.info(),
    passwordFocused: () => fg.passwordFocused(),
    heldModifiers: () => [...new Set(MODIFIERS.filter(([, vk]) => w.keyIsDown(vk)).map(([name]) => name))],
    pressPaste(key) {
      // A Ctrl the user is holding (the dictation key itself) is not pressed or released again.
      const insert = key === "shift-insert";
      const ctrl: Press[] = insert || w.keyIsDown(0x11) ? [] : [{ vk: VK.leftCtrl, up: false }];
      const shift: Press[] = key === "ctrl-v" ? [] : [{ vk: VK.leftShift, up: false }];
      const ups = [...shift, ...ctrl].reverse().map(({ vk }) => ({ vk, up: true }));
      const main = insert ? { vk: VK_INSERT, extended: true } : { vk: VK.v };
      return sendAll([...ctrl, ...shift, { ...main, up: false }, { ...main, up: true }, ...ups]);
    },
    focus: (hwnd) => focusWindow(w, hwnd),
    type(text) {
      const events = unicode(text);
      for (let i = 0; i < events.length; i += TYPE_CHUNK * 2) {
        const chunk = events.slice(i, i + TYPE_CHUNK * 2);
        if (w.sendInput(chunk) !== chunk.length) return false;
      }
      return true;
    },
    clipboardSequence: () => w.clipboardSequence(),
    clipboardTraits: () => ({ files: FILE_FORMATS.some((f) => w.clipboardHas(f)), formats: w.clipboardFormatCount(), marks: CLIPBOARD_PRIVACY_MARKS.filter((m) => w.clipboardHas(m)) }),
    markClipboard: (marks) => addWhenFree(w, marks),
  };
}
