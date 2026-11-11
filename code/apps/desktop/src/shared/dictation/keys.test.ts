import { describe, expect, it } from "vite-plus/test";
import { hotkeyFrom, hotkeyKeys, hotkeyLabels, hotkeyText, KEY_VK, keyOfVk, validHotkey } from "./keys";

describe("validHotkey", () => {
  it.each(["ControlRight", "AltRight", "F9", "F24", "CapsLock", "Pause", "ControlLeft+AltLeft+Space", "ControlLeft+KeyD", "ShiftLeft+ControlLeft+AltLeft"])("accepts %s", (h) => {
    expect(validHotkey(h)).toBe(true);
  });

  it.each([
    ["a letter alone would swallow typing", "KeyA"],
    ["Space alone", "Space"],
    ["Escape cancels, it cannot be the hotkey", "Escape"],
    ["an unknown key", "ControlLeft+Banana"],
    ["more than three keys", "ControlLeft+AltLeft+ShiftLeft+KeyD"],
    ["the same key twice", "ControlLeft+ControlLeft"],
    ["letters only", "KeyA+KeyB"],
    ["empty", ""],
  ])("refuses %s", (_why, h) => {
    expect(validHotkey(h)).toBe(false);
  });
});

describe("labels", () => {
  it("puts modifiers first in the order Ctrl, Alt, Shift, Win and names the sides", () => {
    expect(hotkeyLabels("Space+AltLeft+ControlLeft")).toEqual(["Ctrl", "Alt", "Space"]);
    expect(hotkeyLabels("ControlRight")).toEqual(["Right Ctrl"]);
    expect(hotkeyLabels("MetaLeft+KeyD+ShiftLeft")).toEqual(["Shift", "Win", "D"]);
    expect(hotkeyText("ControlLeft+AltLeft+Space")).toBe("Ctrl Alt Space");
  });

  it("shows digits and function keys without their prefix", () => {
    expect(hotkeyLabels("ControlLeft+Digit5")).toEqual(["Ctrl", "5"]);
    expect(hotkeyLabels("F9")).toEqual(["F9"]);
  });
});

describe("hotkeyFrom", () => {
  it("stores the keys that were held together in a fixed order", () => {
    expect(hotkeyFrom(["Space", "AltLeft", "ControlLeft"])).toBe("ControlLeft+AltLeft+Space");
  });
  it("ignores a key reported twice and refuses a set that is not allowed", () => {
    expect(hotkeyFrom(["F9", "F9"])).toBe("F9");
    expect(hotkeyFrom(["KeyA"])).toBeNull();
    expect(hotkeyFrom([])).toBeNull();
  });
});

describe("virtual keys", () => {
  it("maps the keys Windows reports for the left and right modifiers", () => {
    expect(KEY_VK.ControlRight).toBe(0xa3);
    expect(KEY_VK.ControlLeft).toBe(0xa2);
    expect(KEY_VK.F1).toBe(0x70);
    expect(KEY_VK.KeyA).toBe(0x41);
    expect(KEY_VK.Digit0).toBe(0x30);
  });
  it("names a key back, and gives an unknown one a stable name", () => {
    expect(keyOfVk(0xa3)).toBe("ControlRight");
    expect(keyOfVk(0xe7)).toBe("Vk231");
    expect(hotkeyKeys("ControlLeft+Space")).toEqual(["ControlLeft", "Space"]);
  });
});
