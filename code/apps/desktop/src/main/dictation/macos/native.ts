import { OWN_EVENT_MARKER } from "./keymap";
import { handleTapEvent } from "./tap-callback";

type Koffi = (typeof import("koffi"))["default"];

/** What an event tap reports for one key event. `type` is a CGEventType; `flags` the CGEventFlags including device-dependent bits. */
export interface TapEvent {
  type: number;
  /** For mouse events the button number (0 left, 1 right, 2 middle, 3 and up the side buttons). */
  keycode: number;
  flags: number;
  userData: number;
}

export interface MacTap {
  remove(): void;
}

export interface Frontmost {
  pid: number;
  bundleId: string | null;
  name: string | null;
}

export type AccessState = "granted" | "denied" | "unknown";

/** The macOS calls dictation needs, typed. Every other macOS file takes this as its only dependency, which is also how tests replace it. */
export interface MacNative {
  /** Installs an active (able to swallow) session event tap on the main run loop. `onEvent` returns true to swallow. Throws when macOS refuses the tap (no Accessibility or Input Monitoring permission). */
  createTap(onEvent: (e: TapEvent) => boolean, events?: "keys" | "mouse"): MacTap;
  /** Whether the physical key is down right now (HID state, so events this app swallowed still count). */
  keyIsDown(keycode: number): boolean;
  /** CGEventFlags of the modifiers held right now. */
  modifierFlags(): number;
  /** Posts one key event carrying exactly these modifier flags. False when it could not be created. */
  postKey(keycode: number, down: boolean, flags: number): boolean;
  /** Posts a Unicode string as one key down and up pair (at most 20 UTF-16 units). */
  postUnits(units: readonly number[]): boolean;
  /** True while a password field (or anything else) has switched on secure keyboard input. */
  secureInput(): boolean;
  frontmost(): Frontmost | null;
  /** Bounds (in points, top-left origin) of the front-most normal window of this process, or null when it has none on screen. */
  windowBounds(pid: number): { x: number; y: number; width: number; height: number } | null;
  /** Brings the app with this process id to the front. False when it is gone or refuses. */
  activate(pid: number): boolean;
  pasteboard: {
    changeCount(): number;
    /** Type identifiers (UTIs) of the content on the general pasteboard. */
    types(): string[];
    /** Adds empty entries of these types to the content now on the pasteboard. */
    addTypes(types: readonly string[]): boolean;
  };
  inputMonitoring: { status(): AccessState; request(): boolean };
}

const FW = (name: string) => `/System/Library/Frameworks/${name}.framework/${name}`;
const UTF8 = 0x08000100;
const KEYBOARD_KEYCODE_FIELD = 9;
/** NSApplicationActivateIgnoringOtherApps: the app comes to the front even though another one is active. */
const NS_ACTIVATE_IGNORING_OTHER_APPS = 2;
const USER_DATA_FIELD = 42;
const HID_STATE = 1;
const SESSION_TAP = 1;
const TAP_MASK = (1n << 10n) | (1n << 11n) | (1n << 12n); // key down, key up, flags changed
// left, right and other mouse button down and up; moves, drags and the wheel are not in the mask, so they are never read
const MOUSE_MASK = (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n) | (1n << 25n) | (1n << 26n);
const MOUSE_BUTTON_FIELD = 3;
const IOHID_LISTEN_EVENT = 1;
const IOHID_GRANTED = 0;
const IOHID_DENIED = 1;

let cached: MacNative | undefined;

/** koffi is loaded on first use. macOS only; every symbol below is in a public system framework. */
export async function loadMacNative(): Promise<MacNative> {
  cached ??= bind((await import("koffi")).default);
  return cached;
}

function bind(koffi: Koffi): MacNative {
  return { ...tapApi(koffi), ...keyApi(koffi), ...systemApi(koffi), ...windowApi(koffi), ...objcApi(koffi), ...activateApi(koffi) };
}

/** Attaching a mach port to the main run loop, and taking it off and freeing it again. */
function runLoopApi(koffi: Koffi) {
  const cf = koffi.load(FW("CoreFoundation"));
  const CFMachPortCreateRunLoopSource = cf.func("void *CFMachPortCreateRunLoopSource(void *alloc, void *port, int64 order)");
  const CFRunLoopGetMain = cf.func("void *CFRunLoopGetMain()");
  const CFRunLoopAddSource = cf.func("void CFRunLoopAddSource(void *loop, void *source, void *mode)");
  const CFRunLoopRemoveSource = cf.func("void CFRunLoopRemoveSource(void *loop, void *source, void *mode)");
  const CFStringCreateWithCString = cf.func("void *CFStringCreateWithCString(void *alloc, const char *text, uint32 encoding)");
  const CFMachPortInvalidate = cf.func("void CFMachPortInvalidate(void *port)");
  const CFRelease = cf.func("void CFRelease(void *object)");
  return {
    /** Returns the function that detaches and frees everything again. */
    attach(port: unknown): () => void {
      const run = CFMachPortCreateRunLoopSource(null, port, 0);
      const mode = CFStringCreateWithCString(null, "kCFRunLoopCommonModes", UTF8);
      CFRunLoopAddSource(CFRunLoopGetMain(), run, mode);
      return () => {
        CFRunLoopRemoveSource(CFRunLoopGetMain(), run, mode);
        CFMachPortInvalidate(port);
        for (const object of [run, mode, port]) CFRelease(object);
      };
    },
  };
}

function tapApi(koffi: Koffi): Pick<MacNative, "createTap"> {
  const cg = koffi.load(FW("CoreGraphics"));
  const loop = runLoopApi(koffi);
  const TapProc = koffi.proto("void *SpeakKitTapProc(void *proxy, uint32 type, void *event, void *info)");
  const CGEventTapCreate = cg.func("void *CGEventTapCreate(uint32 tap, uint32 place, uint32 options, uint64 events, SpeakKitTapProc *cb, void *info)");
  const CGEventTapEnable = cg.func("void CGEventTapEnable(void *tap, bool on)");
  const CGEventGetIntegerValueField = cg.func("int64 CGEventGetIntegerValueField(void *event, uint32 field)");
  const CGEventGetFlags = cg.func("uint64 CGEventGetFlags(void *event)");
  return {
    createTap(onEvent, events = "keys") {
      let tap: unknown = null;
      let removed = false;
      const callback = koffi.register(
        (_proxy: unknown, type: number, event: unknown) =>
          handleTapEvent(type, event, {
            // A tap that was removed may still get one last callback: it must not be turned on again.
            reenable: () => tap && !removed && CGEventTapEnable(tap, true),
            read: (e, t) => ({
              type: t,
              keycode: Number(CGEventGetIntegerValueField(e, events === "mouse" ? MOUSE_BUTTON_FIELD : KEYBOARD_KEYCODE_FIELD)),
              flags: Number(CGEventGetFlags(e)),
              userData: Number(CGEventGetIntegerValueField(e, USER_DATA_FIELD)),
            }),
            onEvent,
          }),
        koffi.pointer(TapProc),
      );
      tap = CGEventTapCreate(SESSION_TAP, 0, 0, events === "mouse" ? MOUSE_MASK : TAP_MASK, callback, null);
      if (!tap) {
        koffi.unregister(callback);
        throw new Error("CGEventTapCreate refused the event tap");
      }
      const detach = loop.attach(tap);
      CGEventTapEnable(tap, true);
      return {
        remove() {
          if (removed) return;
          removed = true;
          CGEventTapEnable(tap, false);
          detach();
          // The callback may still be on the stack when this runs from inside it; koffi must not drop it before it returns.
          setImmediate(() => koffi.unregister(callback));
        },
      };
    },
  };
}

function keyApi(koffi: Koffi): Pick<MacNative, "keyIsDown" | "modifierFlags" | "postKey" | "postUnits"> {
  const cg = koffi.load(FW("CoreGraphics"));
  const cf = koffi.load(FW("CoreFoundation"));
  const CGEventSetFlags = cg.func("void CGEventSetFlags(void *event, uint64 flags)");
  const CGEventSetIntegerValueField = cg.func("void CGEventSetIntegerValueField(void *event, uint32 field, int64 value)");
  const CGEventCreateKeyboardEvent = cg.func("void *CGEventCreateKeyboardEvent(void *source, uint16 keycode, bool down)");
  const CGEventKeyboardSetUnicodeString = cg.func("void CGEventKeyboardSetUnicodeString(void *event, uint64 length, uint16 *units)");
  const CGEventPost = cg.func("void CGEventPost(uint32 tap, void *event)");
  const CGEventSourceCreate = cg.func("void *CGEventSourceCreate(int32 state)");
  const CGEventSourceKeyState = cg.func("bool CGEventSourceKeyState(int32 state, uint16 keycode)");
  const CGEventSourceFlagsState = cg.func("uint64 CGEventSourceFlagsState(int32 state)");
  const CFRelease = cf.func("void CFRelease(void *object)");
  let source: unknown;
  const hid = () => (source ??= CGEventSourceCreate(HID_STATE));
  const post = (e: unknown, flags: number) => {
    CGEventSetFlags(e, flags);
    CGEventSetIntegerValueField(e, USER_DATA_FIELD, OWN_EVENT_MARKER);
    CGEventPost(0, e);
    CFRelease(e);
  };
  return {
    keyIsDown: (keycode) => CGEventSourceKeyState(HID_STATE, keycode),
    modifierFlags: () => Number(CGEventSourceFlagsState(HID_STATE)),
    postKey(keycode, down, flags) {
      const e = CGEventCreateKeyboardEvent(hid(), keycode, down);
      if (!e) return false;
      post(e, flags);
      return true;
    },
    postUnits(units) {
      for (const down of [true, false]) {
        const e = CGEventCreateKeyboardEvent(hid(), 0, down);
        if (!e) return false;
        CGEventKeyboardSetUnicodeString(e, units.length, Uint16Array.from(units));
        post(e, 0);
      }
      return true;
    },
  };
}

function systemApi(koffi: Koffi): Pick<MacNative, "secureInput" | "inputMonitoring"> {
  const IsSecureEventInputEnabled = koffi.load(FW("Carbon")).func("bool IsSecureEventInputEnabled()");
  const iokit = koffi.load(FW("IOKit"));
  const IOHIDCheckAccess = iokit.func("uint32 IOHIDCheckAccess(uint32 type)");
  const IOHIDRequestAccess = iokit.func("bool IOHIDRequestAccess(uint32 type)");
  const states: Record<number, AccessState> = { [IOHID_GRANTED]: "granted", [IOHID_DENIED]: "denied" };
  return {
    secureInput: () => IsSecureEventInputEnabled(),
    inputMonitoring: { status: () => states[IOHIDCheckAccess(IOHID_LISTEN_EVENT)] ?? "unknown", request: () => IOHIDRequestAccess(IOHID_LISTEN_EVENT) },
  };
}

/** Window list from CoreGraphics: the windows come front to back, so the first normal one (layer 0) owned by the process is the one in view. */
function windowApi(koffi: Koffi): Pick<MacNative, "windowBounds"> {
  const cf = koffi.load(FW("CoreFoundation"));
  const cg = koffi.load(FW("CoreGraphics"));
  koffi.struct("SpeakKitRect", { x: "double", y: "double", width: "double", height: "double" });
  const CFStringCreateWithCString = cf.func("void *CFStringCreateWithCString(void *alloc, const char *text, uint32 encoding)");
  const CFArrayGetCount = cf.func("int64 CFArrayGetCount(void *array)");
  const CFArrayGetValueAtIndex = cf.func("void *CFArrayGetValueAtIndex(void *array, int64 index)");
  const CFDictionaryGetValue = cf.func("void *CFDictionaryGetValue(void *dict, void *key)");
  const CFNumberGetValue = cf.func("bool CFNumberGetValue(void *number, int32 type, _Out_ int64 *out)");
  const CFRelease = cf.func("void CFRelease(void *object)");
  const CGWindowListCopyWindowInfo = cg.func("void *CGWindowListCopyWindowInfo(uint32 option, uint32 relativeTo)");
  const CGRectMakeWithDictionaryRepresentation = cg.func("bool CGRectMakeWithDictionaryRepresentation(void *dict, _Out_ SpeakKitRect *rect)");
  const ON_SCREEN_ONLY = 1;
  const EXCLUDE_DESKTOP_ELEMENTS = 16;
  const SINT64 = 4;
  return {
    windowBounds(pid) {
      const key = (name: string) => CFStringCreateWithCString(null, name, UTF8);
      const keys = { pid: key("kCGWindowOwnerPID"), layer: key("kCGWindowLayer"), bounds: key("kCGWindowBounds") };
      const list = CGWindowListCopyWindowInfo(ON_SCREEN_ONLY | EXCLUDE_DESKTOP_ELEMENTS, 0);
      try {
        const number = (info: unknown, k: unknown) => {
          const out = [0];
          const value = CFDictionaryGetValue(info, k);
          return value && CFNumberGetValue(value, SINT64, out) ? Number(out[0]) : undefined;
        };
        for (let i = 0, n = list ? Number(CFArrayGetCount(list)) : 0; i < n; i++) {
          const info = CFArrayGetValueAtIndex(list, i);
          if (number(info, keys.pid) !== pid || number(info, keys.layer) !== 0) continue;
          const dict = CFDictionaryGetValue(info, keys.bounds);
          const rect = { x: 0, y: 0, width: 0, height: 0 };
          if (dict && CGRectMakeWithDictionaryRepresentation(dict, rect)) return rect;
        }
        return null;
      } finally {
        if (list) CFRelease(list);
        for (const k of Object.values(keys)) CFRelease(k);
      }
    },
  };
}

function activateApi(koffi: Koffi): Pick<MacNative, "activate"> {
  const objc = koffi.load("/usr/lib/libobjc.A.dylib");
  const getClass = objc.func("void *objc_getClass(const char *name)");
  const sel = objc.func("void *sel_registerName(const char *name)");
  const appOf = objc.func("void *objc_msgSend(void *self, void *sel, uint64 pid)");
  const isTerminated = objc.func("bool objc_msgSend(void *self, void *sel)");
  const activateWith = objc.func("bool objc_msgSend(void *self, void *sel, uint64 options)");
  return {
    activate(pid) {
      const app = appOf(getClass("NSRunningApplication"), sel("runningApplicationWithProcessIdentifier:"), pid);
      return !!app && !isTerminated(app, sel("isTerminated")) && activateWith(app, sel("activateWithOptions:"), NS_ACTIVATE_IGNORING_OTHER_APPS);
    },
  };
}

function objcApi(koffi: Koffi): Pick<MacNative, "frontmost" | "pasteboard"> {
  const objc = koffi.load("/usr/lib/libobjc.A.dylib");
  const getClass = objc.func("void *objc_getClass(const char *name)");
  const sel = objc.func("void *sel_registerName(const char *name)");
  // One symbol, one declaration per call shape: objc_msgSend takes whatever the selector needs.
  const msg = {
    obj: objc.func("void *objc_msgSend(void *self, void *sel)"),
    objObj: objc.func("void *objc_msgSend(void *self, void *sel, void *a)"),
    objUint: objc.func("void *objc_msgSend(void *self, void *sel, uint64 a)"),
    objStr: objc.func("void *objc_msgSend(void *self, void *sel, const char *a)"),
    boolObjObj: objc.func("bool objc_msgSend(void *self, void *sel, void *a, void *b)"),
    int: objc.func("int32 objc_msgSend(void *self, void *sel)"),
    long: objc.func("int64 objc_msgSend(void *self, void *sel)"),
    uint: objc.func("uint64 objc_msgSend(void *self, void *sel)"),
    str: objc.func("str objc_msgSend(void *self, void *sel)"),
    longObjObj: objc.func("int64 objc_msgSend(void *self, void *sel, void *a, void *b)"),
  };
  const cls = (name: string) => getClass(name);
  const nsString = (text: string) => msg.objStr(cls("NSString"), sel("stringWithUTF8String:"), text);
  const generalPasteboard = () => msg.obj(cls("NSPasteboard"), sel("generalPasteboard"));
  const utf8 = (object: unknown) => (object ? msg.str(object, sel("UTF8String")) : null);
  return {
    frontmost() {
      const app = msg.obj(msg.obj(cls("NSWorkspace"), sel("sharedWorkspace")), sel("frontmostApplication"));
      if (!app) return null;
      const text = (selector: string) => utf8(msg.obj(app, sel(selector)));
      return { pid: msg.int(app, sel("processIdentifier")), bundleId: text("bundleIdentifier"), name: text("localizedName") };
    },
    pasteboard: {
      changeCount: () => Number(msg.long(generalPasteboard(), sel("changeCount"))),
      types() {
        const types = msg.obj(generalPasteboard(), sel("types"));
        if (!types) return [];
        const count = Number(msg.uint(types, sel("count")));
        const names = Array.from({ length: count }, (_, i) => utf8(msg.objUint(types, sel("objectAtIndex:"), i)));
        return names.filter((t): t is string => !!t);
      },
      addTypes(types) {
        const pb = generalPasteboard();
        const list = types.reduce((arr, t) => msg.objObj(arr, sel("arrayByAddingObject:"), nsString(t)), msg.obj(cls("NSArray"), sel("array")));
        if (Number(msg.longObjObj(pb, sel("addTypes:owner:"), list, null)) === 0) return false;
        return types.every((t) => msg.boolObjObj(pb, sel("setString:forType:"), nsString(""), nsString(t)));
      },
    },
  };
}
