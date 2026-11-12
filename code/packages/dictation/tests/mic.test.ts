import { describe, expect, it } from "vitest";
import { chooseMic, isDigitalSilence, levelOf, micKind, micStatus, type MicDevice } from "../src/mic";

const builtIn: MicDevice = { id: "b", label: "Microphone Array (Realtek)" };
const usb: MicDevice = { id: "u", label: "Blue Yeti" };
const buds: MicDevice = { id: "bt", label: "Headset (WH-1000XM4 Hands-Free)" };
const cable: MicDevice = { id: "v", label: "CABLE Output (VB-Audio Virtual Cable)" };
const phone: MicDevice = { id: "p", label: "iPhone Microphone" };

describe("micKind", () => {
  it("classifies by name", () => {
    expect(micKind(builtIn)).toBe("built-in");
    expect(micKind(usb)).toBe("wired");
    expect(micKind(buds)).toBe("bluetooth");
    expect(micKind(cable)).toBe("virtual");
    expect(micKind(phone)).toBe("virtual");
  });
  it("does not call a wired headset Bluetooth, and does not match short tokens inside other words", () => {
    expect(micKind({ id: "h", label: "Logitech H390 USB Headset" })).toBe("wired");
    expect(micKind({ id: "h", label: "Headset Microphone (Realtek(R) Audio)" })).toBe("built-in");
    expect(micKind({ id: "h", label: "Headset (WH-1000XM4 Hands-Free)" })).toBe("bluetooth");
    expect(micKind({ id: "c", label: "Candid Mic" })).toBe("wired");
    expect(micKind({ id: "j", label: "Microphone (Jobs Studio)" })).toBe("wired");
    expect(micKind({ id: "o", label: "OBS Virtual Camera Audio" })).toBe("virtual");
    expect(micKind({ id: "n", label: "NDI Audio" })).toBe("virtual");
  });
  it("keeps a wired USB headset that is the system default", () => {
    const headset = { id: "h", label: "Logitech H390 USB Headset" };
    const choice = chooseMic({ devices: [builtIn, headset], defaultId: "h", avoidBluetooth: true });
    expect(choice).toMatchObject({ kind: "device", id: "h", bluetooth: false });
  });
  it("applies the person's exclusion list", () => {
    expect(micKind(usb, ["yeti"])).toBe("virtual");
    expect(micKind(usb, ["  "])).toBe("wired");
  });
});

describe("chooseMic", () => {
  const base = { avoidBluetooth: true };
  it("a saved device wins, even a virtual one", () => {
    expect(chooseMic({ ...base, devices: [builtIn, cable], saved: "v", defaultId: "b" })).toEqual({
      kind: "device",
      id: "v",
      label: cable.label,
      source: "saved",
      fellBack: false,
      bluetooth: false,
    });
  });
  it("a missing saved device falls back to the default and switches back when it returns", () => {
    expect(chooseMic({ ...base, devices: [builtIn], saved: "u", defaultId: "b" })).toMatchObject({ id: "b", source: "default", fellBack: true });
    expect(chooseMic({ ...base, devices: [builtIn, usb], saved: "u", defaultId: "b" })).toMatchObject({ id: "u", source: "saved", fellBack: false });
  });
  it("never picks a virtual or phone input on its own", () => {
    expect(chooseMic({ ...base, devices: [cable, phone, usb], defaultId: "v" })).toMatchObject({ id: "u", source: "wired" });
    expect(chooseMic({ ...base, devices: [cable, usb], defaultId: "u", exclusions: ["yeti"] })).toEqual({ kind: "none", reason: "no-device" });
  });
  it("skips a headset default for the built-in input when asked", () => {
    expect(chooseMic({ ...base, devices: [buds, builtIn, usb], defaultId: "bt" })).toMatchObject({ id: "b", source: "built-in", bluetooth: false });
    expect(chooseMic({ ...base, devices: [buds, usb], defaultId: "bt" })).toMatchObject({ id: "u", source: "wired" });
  });
  it("keeps the headset when nothing else exists, or when not asked to avoid it", () => {
    expect(chooseMic({ ...base, devices: [buds], defaultId: "bt" })).toMatchObject({ id: "bt", source: "bluetooth", bluetooth: true });
    expect(chooseMic({ ...base, devices: [buds], defaultId: "other" })).toMatchObject({ id: "bt", source: "bluetooth", bluetooth: true });
    expect(chooseMic({ avoidBluetooth: false, devices: [buds, builtIn], defaultId: "bt" })).toMatchObject({ id: "bt", source: "default", bluetooth: true });
  });
  it("honours an explicitly saved Bluetooth device", () => {
    expect(chooseMic({ ...base, devices: [buds, builtIn], saved: "bt", defaultId: "b" })).toMatchObject({ id: "bt", source: "saved", bluetooth: true });
  });
  it("passes over an input that only delivered silence", () => {
    expect(chooseMic({ ...base, devices: [builtIn, usb], defaultId: "b", silent: ["b"] })).toMatchObject({ id: "u" });
  });
  it("reports no device for an empty list", () => {
    expect(chooseMic({ ...base, devices: [] })).toEqual({ kind: "none", reason: "no-device" });
  });
  it("says the built-in microphone is off when only virtual inputs remain (lid closed)", () => {
    expect(chooseMic({ ...base, devices: [phone], defaultId: "p" })).toEqual({ kind: "none", reason: "built-in-off" });
  });
  it("keeps a saved external microphone with the lid closed", () => {
    expect(chooseMic({ ...base, devices: [usb, phone], saved: "u" })).toMatchObject({ id: "u", source: "saved" });
  });
  it("uses the first usable input when the default is not listed", () => {
    expect(chooseMic({ ...base, devices: [usb], defaultId: "missing" })).toMatchObject({ id: "u", source: "wired" });
  });
});

describe("levelOf", () => {
  it("is zero for an empty or constant block (offset removed)", () => {
    expect(levelOf(new Float32Array(0))).toBe(0);
    expect(levelOf(new Float32Array(100).fill(0.5))).toBe(0);
  });
  it("measures the swing of a square wave, not its offset", () => {
    const wave = Float32Array.from({ length: 100 }, (_, i) => 0.3 + (i % 2 ? 0.1 : -0.1));
    expect(levelOf(wave)).toBeCloseTo(0.6, 5);
  });
  it("caps at 1", () => {
    expect(levelOf(Float32Array.from({ length: 10 }, (_, i) => (i % 2 ? 1 : -1)))).toBe(1);
  });
});

describe("isDigitalSilence", () => {
  it("is true only for exact zeros", () => {
    expect(isDigitalSilence(new Float32Array(10))).toBe(true);
    expect(isDigitalSilence(Float32Array.from([0, 0, 1e-9]))).toBe(false);
    expect(isDigitalSilence(new Float32Array(0))).toBe(true);
  });
});

describe("micStatus", () => {
  const ready = { kind: "ready", label: "Blue Yeti" } as const;
  it("walks through lost and back", () => {
    let s = micStatus(ready, { type: "reopening", attempt: 1 }, true);
    expect(s).toEqual({ kind: "reconnecting", attempt: 1 });
    s = micStatus(s, { type: "gave-up" }, true);
    expect(s).toEqual({ kind: "lost" });
    expect(micStatus(s, { type: "chosen", label: "Blue Yeti", bluetooth: false }, true)).toEqual({ kind: "back", label: "Blue Yeti" });
    expect(micStatus({ kind: "reconnecting", attempt: 2 }, { type: "recovered", label: "X" }, true)).toEqual({ kind: "back", label: "X" });
  });
  it("shows the privacy link only where the system has a page", () => {
    expect(micStatus(ready, { type: "silent" }, true)).toEqual({ kind: "blocked", privacyLink: true });
    expect(micStatus(ready, { type: "blocked" }, false)).toEqual({ kind: "blocked", privacyLink: false });
  });
  it("maps the other events", () => {
    expect(micStatus(ready, { type: "chosen", label: "Buds", bluetooth: true }, true)).toEqual({ kind: "bluetooth", label: "Buds" });
    expect(micStatus(ready, { type: "chosen", label: "Blue Yeti", bluetooth: false }, true)).toEqual(ready);
    expect(micStatus(ready, { type: "no-device", builtInOff: true }, true)).toEqual({ kind: "built-in-off" });
    expect(micStatus(ready, { type: "no-device", builtInOff: false }, true)).toEqual({ kind: "none" });
    expect(micStatus(ready, { type: "busy" }, true)).toEqual({ kind: "busy" });
  });
});
