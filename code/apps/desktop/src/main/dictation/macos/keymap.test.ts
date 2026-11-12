import { describe, expect, it } from "vitest";
import { VK } from "../types";
import { KEY_VK } from "../../../shared/dictation/keys";
import { macKeyOfVk, modifierDown, vkOfMacKey } from "./keymap";

describe("mac key codes", () => {
  it("maps the modifier keys to the left and right Windows codes the chords use", () => {
    expect([55, 54, 58, 61, 59, 62, 56, 60].map(vkOfMacKey)).toEqual([VK.leftWin, VK.rightWin, VK.leftAlt, VK.rightAlt, VK.leftCtrl, VK.rightCtrl, VK.leftShift, VK.rightShift]);
  });

  it("maps letters, digits, function keys and space", () => {
    expect([0, 9, 6].map(vkOfMacKey)).toEqual([0x41, 0x56, 0x5a]);
    expect([29, 18, 25].map(vkOfMacKey)).toEqual([0x30, 0x31, 0x39]);
    expect([122, 120, 111, 90].map(vkOfMacKey)).toEqual([0x70, 0x71, 0x7b, 0x83]);
    expect(vkOfMacKey(49)).toBe(VK.space);
    expect(vkOfMacKey(53)).toBe(VK.escape);
  });

  it("round-trips every key a hotkey can name that a Mac keyboard has", () => {
    for (const [code, vk] of Object.entries(KEY_VK)) {
      if (["Pause", "ScrollLock"].includes(code) || (/^F\d+$/.test(code) && Number(code.slice(1)) > 20)) continue;
      expect(macKeyOfVk(vk), code).toBeDefined();
      expect(vkOfMacKey(macKeyOfVk(vk)!), code).toBe(vk);
    }
  });

  it("keeps an unknown key distinct and reversible", () => {
    const vk = vkOfMacKey(63);
    expect(vk).toBe(0x1000 + 63);
    expect(macKeyOfVk(vk)).toBe(63);
    expect(macKeyOfVk(0x1)).toBeUndefined();
  });

  it("reads a modifier's own device bit from the flags", () => {
    expect(modifierDown(61, 0x40)).toBe(true);
    expect(modifierDown(61, 0x20)).toBe(false); // the other Option key is down, this one is not
    expect(modifierDown(54, 0x10 | 0x8)).toBe(true);
    expect(modifierDown(55, 0x10)).toBe(false);
    expect(modifierDown(0, 0xffffffff)).toBeNull();
  });
});
