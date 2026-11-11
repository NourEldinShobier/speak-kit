import type { TypeObject } from "koffi";

type Koffi = (typeof import("koffi"))["default"];
/** An opaque native pointer (window handle, process handle, keyboard layout); null for NULL. */
export type Handle = object | null;

export interface KeyInput {
  type: 1;
  u: { ki: { wVk: number; wScan: number; dwFlags: number; time: 0; dwExtraInfo: number } };
}

/** What the low-level keyboard hook reports for one key stroke (KBDLLHOOKSTRUCT). */
export interface RawKbd {
  vk: number;
  scan: number;
  flags: number;
  time: number;
  extra: number;
}

/** The Win32 calls dictation needs, typed. Loaded once; every other Windows file takes this as its only dependency, which is also how tests replace it. */
export interface Win32 {
  koffi: Koffi;
  sendInput(events: KeyInput[]): number;
  keyIsDown(vk: number): boolean;
  clipboardSequence(): number;
  /** Whether the clipboard holds this format: a standard format number or a registered format's name. Needs no open clipboard. */
  clipboardHas(format: number | string): boolean;
  clipboardFormatCount(): number;
  /** Adds each registered format (by name) to the open-for-us clipboard as a zeroed DWORD, which is what the privacy marks are. False when the clipboard could not be opened or a format was refused. */
  clipboardAdd(names: readonly string[]): boolean;
  keyboardLayout(tid: number): Handle;
  mapVirtualKey(vk: number, layout: Handle): number;
  foregroundWindow(): Handle;
  /** Process and thread that own a window. */
  windowOwner(h: Handle): { pid: number; tid: number };
  className(h: Handle): string;
  /** The control that has keyboard focus in the given thread's window. */
  focusedControl(tid: number): Handle;
  /** GWL_STYLE, or GWL_EXSTYLE when `extended` is true. */
  windowStyle(h: Handle, extended?: boolean): number;
  address(h: Handle): string;
  /** Program file name and whether its token is elevated. Both null when the process cannot be opened; elevated is null when its token is closed to us (a sign it runs with more rights). */
  processInfo(pid: number): { exe: string | null; elevated: boolean | null };
  hook: {
    kbdStruct: TypeObject;
    callbackType: TypeObject;
    install(callback: unknown): Handle;
    callNext(code: number, wParam: number, lParam: unknown): number;
    remove(h: Handle): void;
  };
}

let cached: Promise<Win32> | undefined;

/** koffi is loaded on first use so nothing is paid until dictation starts. Windows only. */
export function loadWin32(): Promise<Win32> {
  cached ??= bind();
  return cached;
}

async function bind(): Promise<Win32> {
  const koffi = (await import("koffi")).default;
  return { koffi, ...keyboardApi(koffi), ...clipboardApi(koffi), ...windowApi(koffi), ...processApi(koffi), hook: hookApi(koffi) };
}

type KeyboardApi = Pick<Win32, "sendInput" | "keyIsDown" | "clipboardSequence" | "keyboardLayout" | "mapVirtualKey">;
type ClipboardApi = Pick<Win32, "clipboardHas" | "clipboardFormatCount" | "clipboardAdd">;

function keyboardApi(koffi: Koffi): KeyboardApi {
  const user32 = koffi.load("user32.dll");
  const keyboard = koffi.struct("SpeakKitKeybdInput", { wVk: "uint16", wScan: "uint16", dwFlags: "uint32", time: "uint32", dwExtraInfo: "uintptr" });
  const mouse = koffi.struct("SpeakKitMouseInput", { dx: "int32", dy: "int32", mouseData: "uint32", dwFlags: "uint32", time: "uint32", dwExtraInfo: "uintptr" });
  const input = koffi.struct("SpeakKitInput", { type: "uint32", u: koffi.union("SpeakKitInputUnion", { ki: keyboard, mi: mouse }) });
  const SendInput = user32.func("uint32 __stdcall SendInput(uint32 n, SpeakKitInput *p, int cb)");
  const GetAsyncKeyState = user32.func("int16 __stdcall GetAsyncKeyState(int vk)");
  const GetClipboardSequenceNumber = user32.func("uint32 __stdcall GetClipboardSequenceNumber()");
  const GetKeyboardLayout = user32.func("void *__stdcall GetKeyboardLayout(uint32 tid)");
  const MapVirtualKeyExW = user32.func("uint32 __stdcall MapVirtualKeyExW(uint32 code, uint32 mapType, void *layout)");
  return {
    sendInput: (events) => SendInput(events.length, events, koffi.sizeof(input)),
    keyIsDown: (vk) => (GetAsyncKeyState(vk) & 0x8000) !== 0,
    clipboardSequence: () => GetClipboardSequenceNumber(),
    keyboardLayout: (tid) => GetKeyboardLayout(tid),
    mapVirtualKey: (vk, layout) => MapVirtualKeyExW(vk, 0, layout),
  };
}

function clipboardApi(koffi: Koffi): ClipboardApi {
  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  const OpenClipboard = user32.func("int __stdcall OpenClipboard(void *owner)");
  const CloseClipboard = user32.func("int __stdcall CloseClipboard()");
  const RegisterClipboardFormatW = user32.func("uint32 __stdcall RegisterClipboardFormatW(str16 name)");
  const IsClipboardFormatAvailable = user32.func("int __stdcall IsClipboardFormatAvailable(uint32 format)");
  const CountClipboardFormats = user32.func("int __stdcall CountClipboardFormats()");
  const SetClipboardData = user32.func("void *__stdcall SetClipboardData(uint32 format, void *memory)");
  const GlobalAlloc = kernel32.func("void *__stdcall GlobalAlloc(uint32 flags, uintptr size)");
  const GlobalFree = kernel32.func("void *__stdcall GlobalFree(void *memory)");
  const GMEM_MOVEABLE_ZEROED = 0x42;
  return {
    clipboardHas: (format) => IsClipboardFormatAvailable(typeof format === "string" ? RegisterClipboardFormatW(format) : format) !== 0,
    clipboardFormatCount: () => CountClipboardFormats(),
    clipboardAdd: (names) => {
      if (!OpenClipboard(null)) return false;
      try {
        return names.every((name) => {
          const memory = GlobalAlloc(GMEM_MOVEABLE_ZEROED, 4);
          if (!memory) return false;
          if (SetClipboardData(RegisterClipboardFormatW(name), memory)) return true; // the clipboard owns the memory now
          GlobalFree(memory);
          return false;
        });
      } finally {
        CloseClipboard();
      }
    },
  };
}

type WindowApi = Pick<Win32, "foregroundWindow" | "windowOwner" | "className" | "focusedControl" | "windowStyle" | "address">;

function windowApi(koffi: Koffi): WindowApi {
  const user32 = koffi.load("user32.dll");
  const rect = koffi.struct("SpeakKitRect", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
  const guiThread = koffi.struct("SpeakKitGuiThreadInfo", {
    cbSize: "uint32",
    flags: "uint32",
    hwndActive: "void *",
    hwndFocus: "void *",
    hwndCapture: "void *",
    hwndMenuOwner: "void *",
    hwndMoveSize: "void *",
    hwndCaret: "void *",
    rcCaret: rect,
  });
  const GetForegroundWindow = user32.func("void *__stdcall GetForegroundWindow()");
  const GetWindowThreadProcessId = user32.func("uint32 __stdcall GetWindowThreadProcessId(void *h, _Out_ uint32 *pid)");
  const GetClassNameW = user32.func("int __stdcall GetClassNameW(void *h, _Out_ uint16_t *buf, int n)");
  const GetGUIThreadInfo = user32.func("int __stdcall GetGUIThreadInfo(uint32 tid, _Inout_ SpeakKitGuiThreadInfo *info)");
  const GetWindowLongW = user32.func("int32 __stdcall GetWindowLongW(void *h, int index)");
  const GWL_STYLE = -16;
  const GWL_EXSTYLE = -20;
  return {
    foregroundWindow: () => GetForegroundWindow(),
    windowOwner: (h) => {
      const pid = [0];
      const tid = GetWindowThreadProcessId(h, pid);
      return { pid: pid[0] ?? 0, tid };
    },
    className: (h) => {
      const buf = new Uint16Array(256);
      return String.fromCharCode(...buf.subarray(0, GetClassNameW(h, buf, 256)));
    },
    focusedControl: (tid) => {
      const info = { cbSize: koffi.sizeof(guiThread), hwndFocus: null as Handle };
      return GetGUIThreadInfo(tid, info) ? info.hwndFocus : null;
    },
    windowStyle: (h, extended = false) => GetWindowLongW(h, extended ? GWL_EXSTYLE : GWL_STYLE) >>> 0,
    address: (h) => String(h ? koffi.address(h) : 0),
  };
}

function processApi(koffi: Koffi): Pick<Win32, "processInfo"> {
  const kernel32 = koffi.load("kernel32.dll");
  const advapi32 = koffi.load("advapi32.dll");
  const OpenProcess = kernel32.func("void *__stdcall OpenProcess(uint32 access, int inherit, uint32 pid)");
  const CloseHandle = kernel32.func("int __stdcall CloseHandle(void *h)");
  const QueryFullProcessImageNameW = kernel32.func("int __stdcall QueryFullProcessImageNameW(void *h, uint32 flags, _Out_ uint16_t *buf, _Inout_ uint32 *n)");
  const OpenProcessToken = advapi32.func("int __stdcall OpenProcessToken(void *h, uint32 access, _Out_ void **token)");
  const GetTokenInformation = advapi32.func("int __stdcall GetTokenInformation(void *token, int kind, _Out_ uint32 *info, uint32 len, _Out_ uint32 *returned)");
  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
  const TOKEN_QUERY = 0x8;
  const TOKEN_ELEVATION = 20;
  return {
    processInfo: (pid) => {
      const process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
      if (!process) return { exe: null, elevated: null };
      try {
        const buf = new Uint16Array(520);
        const n = [520];
        const exe = QueryFullProcessImageNameW(process, 0, buf, n)
          ? (String.fromCharCode(...buf.subarray(0, n[0] ?? 0))
              .split("\\")
              .pop() ?? null)
          : null;
        const token: unknown[] = [null];
        if (!OpenProcessToken(process, TOKEN_QUERY, token)) return { exe, elevated: null };
        const elevation = [0];
        const ok = GetTokenInformation(token[0], TOKEN_ELEVATION, elevation, 4, [0]);
        CloseHandle(token[0]);
        return { exe, elevated: ok ? elevation[0] !== 0 : null };
      } finally {
        CloseHandle(process);
      }
    },
  };
}

function hookApi(koffi: Koffi): Win32["hook"] {
  const user32 = koffi.load("user32.dll");
  const callbackType = koffi.proto("intptr __stdcall SpeakKitHookProc(int code, uintptr wParam, void *lParam)");
  const GetModuleHandleW = koffi.load("kernel32.dll").func("void *__stdcall GetModuleHandleW(void *name)");
  const SetWindowsHookExW = user32.func("void *__stdcall SetWindowsHookExW(int id, SpeakKitHookProc *fn, void *module, uint32 tid)");
  const CallNextHookEx = user32.func("intptr __stdcall CallNextHookEx(void *hook, int code, uintptr wParam, void *lParam)");
  const UnhookWindowsHookEx = user32.func("int __stdcall UnhookWindowsHookEx(void *hook)");
  const WH_KEYBOARD_LL = 13;
  return {
    kbdStruct: koffi.struct("SpeakKitKbdLlHook", { vk: "uint32", scan: "uint32", flags: "uint32", time: "uint32", extra: "uintptr" }),
    callbackType,
    install: (callback) => SetWindowsHookExW(WH_KEYBOARD_LL, callback, GetModuleHandleW(null), 0),
    callNext: (code, wParam, lParam) => Number(CallNextHookEx(null, code, wParam, lParam)),
    remove: (h) => void UnhookWindowsHookEx(h),
  };
}
