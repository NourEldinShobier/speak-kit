import type { MacNative } from "./native";

type Koffi = (typeof import("koffi"))["default"];

export const FW = (name: string) => `/System/Library/Frameworks/${name}.framework/${name}`;
export const UTF8 = 0x08000100;

/** Window list from CoreGraphics: the windows come front to back, so the first normal one (layer 0) owned by the process is the one in view. */
export function windowApi(koffi: Koffi): Pick<MacNative, "windowBounds"> {
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

/** Accessibility: is the focused control a secure text field? Needs the Accessibility permission; without it the answer is no. */
const AX_TIMEOUT_SECONDS = 0.25;

export function axApi(koffi: Koffi): Pick<MacNative, "passwordFocused"> {
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
