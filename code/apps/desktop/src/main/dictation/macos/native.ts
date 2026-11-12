import { OWN_EVENT_MARKER } from "./keymap";
import { handleTapEvent } from "./tap-callback";

type Koffi = (typeof import("koffi"))["default"];

/** What an event tap reports for one key event. `type` is a CGEventType; `flags` the CGEventFlags including device-dependent bits. */
export interface TapEvent {
  type: number;
  keycode: number;
  flags: number;
  userData: number;
  /** Mouse button number (0 left, 1 right, 2 middle, 3 and 4 the side buttons); 0 for key events. */
  button: number;
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
  /** Installs an active (able to swallow) session event tap on the main run loop: key events, or button presses and releases for "mouse". `onEvent` returns true to swallow. Throws when macOS refuses the tap (no Accessibility or Input Monitoring permission). */
  createTap(onEvent: (e: TapEvent) => boolean, kind?: "keys" | "mouse"): MacTap;
  /** Whether the focused control of the front app is a password field (Accessibility query). False when it cannot be asked. */
  passwordFocused(): boolean;
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
const TAP_MASKS = {
  keys: (1n << 10n) | (1n << 11n) | (1n << 12n), // key down, key up, flags changed
  mouse: [1n, 2n, 3n, 4n, 25n, 26n].reduce((m, t) => m | (1n << t), 0n), // left, right and other button down and up
};
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
  return { ...tapApi(koffi), ...keyApi(koffi), ...systemApi(koffi), ...objcApi(koffi), ...activateApi(koffi), ...axApi(koffi) };
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
    createTap(onEvent, kind = "keys") {
      let tap: unknown = null;
      let removed = false;
      const callback = koffi.register(
        (_proxy: unknown, type: number, event: unknown) =>
          handleTapEvent(type, event, {
            // A tap that was removed may still get one last callback: it must not be turned on again.
            reenable: () => tap && !removed && CGEventTapEnable(tap, true),
            read: (e, t) => ({
              type: t,
              keycode: Number(CGEventGetIntegerValueField(e, KEYBOARD_KEYCODE_FIELD)),
              flags: Number(CGEventGetFlags(e)),
              userData: Number(CGEventGetIntegerValueField(e, USER_DATA_FIELD)),
              button: kind === "mouse" ? Number(CGEventGetIntegerValueField(e, MOUSE_BUTTON_FIELD)) : 0,
            }),
            onEvent,
          }),
        koffi.pointer(TapProc),
      );
      tap = CGEventTapCreate(SESSION_TAP, 0, 0, TAP_MASKS[kind], callback, null);
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

/** Accessibility: is the focused control a secure text field? Needs the Accessibility permission; without it the answer is no. */
const AX_TIMEOUT_SECONDS = 0.25;

function axApi(koffi: Koffi): Pick<MacNative, "passwordFocused"> {
  const ax = koffi.load(FW("ApplicationServices"));
  const cf = koffi.load(FW("CoreFoundation"));
  const AXIsProcessTrusted = ax.func("bool AXIsProcessTrusted()");
  const AXUIElementCreateSystemWide = ax.func("void *AXUIElementCreateSystemWide()");
  const AXUIElementSetMessagingTimeout = ax.func("int32 AXUIElementSetMessagingTimeout(void *element, float seconds)");
  const AXUIElementCopyAttributeValue = ax.func("int32 AXUIElementCopyAttributeValue(void *element, void *attribute, _Out_ void **value)");
  const CFStringCreateWithCString = cf.func("void *CFStringCreateWithCString(void *alloc, const char *text, uint32 encoding)");
  const CFEqual = cf.func("bool CFEqual(void *a, void *b)");
  const CFRelease = cf.func("void CFRelease(void *object)");
  const names = new Map<string, unknown>();
  const name = (text: string) => names.get(text) ?? (names.set(text, CFStringCreateWithCString(null, text, UTF8)), names.get(text));
  const copy = (element: unknown, attribute: string): unknown => {
    const out: unknown[] = [null];
    return AXUIElementCopyAttributeValue(element, name(attribute), out) === 0 ? out[0] : null;
  };
  return {
    passwordFocused() {
      if (!AXIsProcessTrusted()) return false;
      const system = AXUIElementCreateSystemWide();
      // A hung front app would otherwise block this thread for the default timeout (seconds); a timed-out query reads as "not a password field".
      AXUIElementSetMessagingTimeout(system, AX_TIMEOUT_SECONDS);
      const focused = copy(system, "AXFocusedUIElement");
      CFRelease(system);
      if (!focused) return false;
      const subrole = copy(focused, "AXSubrole");
      const secure = !!subrole && CFEqual(subrole, name("AXSecureTextField"));
      for (const object of [subrole, focused]) if (object) CFRelease(object);
      return secure;
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
