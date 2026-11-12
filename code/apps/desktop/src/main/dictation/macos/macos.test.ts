import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createInserter } from "../inserter";
import type { ClipboardPort } from "../restore-guard";
import { VK, type HotkeyEvent } from "../types";
import { installMouseTapHook, installTapHook } from "./hook";
import { chunks, createMacInput } from "./input";
import { fakeMacNative } from "./fake-native";
import { createMacPlatformWith } from "./index";
import { OWN_EVENT_MARKER } from "./keymap";

const KEY_DOWN = 10;
const KEY_UP = 11;
const FLAGS = 12;
const RIGHT_OPTION = 61;
const RIGHT_OPTION_BIT = 0x40;
const F9 = 101;

/** Typing yields to the event loop between pieces, which the fake timers hold back until they are run. */
const finished = async <T>(p: Promise<T>): Promise<T> => {
  for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
  return p;
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function started(chord: number[]) {
  const fake = fakeMacNative();
  const platform = createMacPlatformWith(fake.native);
  const events: HotkeyEvent[] = [];
  const faults: unknown[] = [];
  const result = platform.hotkey.start({ keys: chord }, { onEvent: (e) => void events.push(e), onFault: (e) => void faults.push(e) });
  return { fake, platform, events, faults, result };
}

describe("macOS hotkey through the event tap", () => {
  it("turns a lone modifier into hold-to-talk and never swallows it", async () => {
    const t = started([VK.rightAlt]);
    expect(t.result).toEqual({ ok: true });
    expect(t.fake.send({ type: FLAGS, keycode: RIGHT_OPTION, flags: RIGHT_OPTION_BIT })).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "down" }]);
    expect(t.fake.send({ type: FLAGS, keycode: RIGHT_OPTION, flags: 0 })).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "up" }]);
  });

  it("tells the two Option keys apart by their own flag bit", async () => {
    const t = started([VK.rightAlt]);
    t.fake.send({ type: FLAGS, keycode: 58, flags: 0x20 }); // left Option down: not the chord
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([]);
  });

  it("swallows the key that completes a chord, and its release", async () => {
    const t = started([VK.rightAlt, 0x78]);
    t.fake.send({ type: FLAGS, keycode: RIGHT_OPTION, flags: RIGHT_OPTION_BIT });
    expect(t.fake.send({ type: KEY_DOWN, keycode: F9, flags: RIGHT_OPTION_BIT })).toBe(true);
    expect(t.fake.send({ type: KEY_UP, keycode: F9, flags: RIGHT_OPTION_BIT })).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "up" }]);
  });

  it("lets a key through that is not part of the chord and reports it", async () => {
    const t = started([VK.rightAlt]);
    t.fake.send({ type: FLAGS, keycode: RIGHT_OPTION, flags: RIGHT_OPTION_BIT });
    expect(t.fake.send({ type: KEY_DOWN, keycode: 0 })).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "other", vk: 0x41 }]);
  });

  it("ignores the key events this app posted itself", async () => {
    const t = started([0x78]);
    expect(t.fake.send({ type: KEY_DOWN, keycode: F9, userData: OWN_EVENT_MARKER })).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([]);
  });

  it("repairs a stuck key: the release was never seen but the keyboard says it is up", async () => {
    const t = started([VK.rightAlt]);
    t.fake.state.down.add(RIGHT_OPTION);
    t.fake.send({ type: FLAGS, keycode: RIGHT_OPTION, flags: RIGHT_OPTION_BIT });
    await vi.advanceTimersByTimeAsync(150);
    expect(t.events).toEqual([{ kind: "down" }]);
    t.fake.state.down.delete(RIGHT_OPTION);
    await vi.advanceTimersByTimeAsync(150);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "up" }]);
  });

  it("reports hook-failed when macOS refuses the tap (permission missing), without throwing", () => {
    const fake = fakeMacNative({ refuseTap: true });
    const platform = createMacPlatformWith(fake.native);
    expect(platform.hotkey.start({ keys: [VK.rightAlt] }, { onEvent() {} })).toEqual({ ok: false, reason: "hook-failed" });
    expect(platform.hotkey.active).toBe(false);
  });

  it("is supported, and dispose removes the tap", () => {
    const t = started([VK.rightAlt]);
    expect(t.platform.supported).toBe(true);
    t.platform.dispose();
    expect(t.platform.hotkey.active).toBe(false);
    expect(t.fake.calls.removed).toBe(1);
  });

  it("refuses a second start and removes the tap on stop, also when stopped twice", () => {
    const t = started([VK.rightAlt]);
    expect(t.platform.hotkey.start({ keys: [VK.rightAlt] }, { onEvent() {} })).toEqual({ ok: false, reason: "already-running" });
    t.platform.hotkey.stop();
    t.platform.hotkey.stop();
    expect(t.fake.calls.removed).toBe(1);
  });

  it("passes the key on, removes the tap and reports the fault when the decision throws", async () => {
    const fake = fakeMacNative();
    const faults: unknown[] = [];
    installTapHook(
      fake.native,
      () => {
        throw new Error("boom");
      },
      (e) => void faults.push(e),
    );
    expect(fake.send({ keycode: 0 })).toBe(false);
    expect(fake.send({ keycode: 0 })).toBe(false); // already dead: nothing is decided any more
    await vi.advanceTimersByTimeAsync(0);
    expect(faults).toEqual([new Error("boom")]);
    expect(fake.calls.removed).toBe(1);
  });

  it("passes a flags change of a key that is no modifier of the chord, and other event kinds", () => {
    const t = started([VK.rightAlt]);
    expect(t.fake.send({ type: FLAGS, keycode: 63, flags: 0x800000 })).toBe(false); // fn
    expect(t.fake.send({ type: 5, keycode: 0 })).toBe(false); // mouse move
  });

  it("swallows the cancel key only while it is grabbed", async () => {
    const t = started([VK.rightAlt]);
    expect(t.fake.send({ type: KEY_DOWN, keycode: 53 })).toBe(false);
    t.fake.send({ type: KEY_UP, keycode: 53 });
    t.platform.hotkey.grab([VK.escape]);
    expect(t.fake.send({ type: KEY_DOWN, keycode: 53 })).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events.at(-1)).toEqual({ kind: "grabbed", vk: VK.escape });
  });

  it("resync releases a chord whose release went to another desktop", async () => {
    const t = started([VK.rightAlt]);
    t.fake.send({ type: FLAGS, keycode: RIGHT_OPTION, flags: RIGHT_OPTION_BIT });
    t.platform.hotkey.resync();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "up" }]);
  });
});

describe("macOS mouse buttons through the mouse tap", () => {
  const X1_DOWN = { type: 25, button: 3 };
  const X1_UP = { type: 26, button: 3 };

  it("makes a side button a hold-to-talk key and swallows it", async () => {
    const t = started([0x05]);
    expect(t.result).toEqual({ ok: true });
    expect(t.fake.sendMouse(X1_DOWN)).toBe(true);
    expect(t.fake.sendMouse(X1_UP)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "up" }]);
  });

  it("passes on events that are no button change", () => {
    const t = started([0x05]);
    expect(t.fake.sendMouse({ type: 5, button: 3 })).toBe(false);
    expect(t.fake.sendMouse({ type: 25, button: 9 })).toBe(false);
  });

  it("passes the click on, removes the tap and reports the fault when the decision throws", async () => {
    const fake = fakeMacNative();
    const faults: unknown[] = [];
    installMouseTapHook(
      fake.native,
      () => {
        throw new Error("boom");
      },
      (e) => void faults.push(e),
    );
    expect(fake.sendMouse(X1_DOWN)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(faults).toEqual([new Error("boom")]);
    expect(fake.calls.removed).toBe(1);
  });
});

describe("macOS password control", () => {
  it("reports a focused password control through the input port", () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    expect(input.passwordFocused()).toBe(false);
    fake.state.passwordFocused = true;
    expect(input.passwordFocused()).toBe(true);
  });
});

describe("macOS foreground and paste keys", () => {
  it("names the frontmost app by bundle identifier and never calls it elevated", () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    expect(input.foreground()).toEqual({ hwnd: "501", pid: 501, exe: "com.apple.TextEdit", className: "", elevated: false });
    fake.state.front = { pid: 7, bundleId: null, name: "Tool" };
    expect(input.foreground()?.exe).toBe("Tool");
    fake.state.front = null;
    expect(input.foreground()).toBeNull();
  });

  it("reports the front window's bounds so a full-screen program can be told, and none when it has no window", () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    expect(input.foreground()).not.toHaveProperty("bounds");
    fake.state.windows.set(501, { x: 0, y: 0, width: 1512, height: 982 });
    expect(input.foreground()?.bounds).toEqual({ x: 0, y: 0, width: 1512, height: 982 });
  });

  it("adds the keyboard layout language when the reader has one", () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native, { current: () => "de" });
    expect(input.foreground()).toMatchObject({ exe: "com.apple.TextEdit", layout: "de" });
  });

  it("does not read the layout when the caller says nobody needs it", () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native, { current: () => "de" });
    expect(input.foreground({ layout: false })?.layout).toBeUndefined();
    expect(input.foreground({ layout: true })?.layout).toBe("de");
  });

  it("pastes with Command+V and adds Shift when asked, releasing the key last", () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    expect(input.pressPaste("ctrl-v")).toBe(true);
    expect(input.pressPaste("ctrl-shift-v")).toBe(true);
    expect(fake.state.posted).toEqual([
      { keycode: 9, down: true, flags: 0x100000 },
      { keycode: 9, down: false, flags: 0x100000 },
      { keycode: 9, down: true, flags: 0x120000 },
      { keycode: 9, down: false, flags: 0x120000 },
    ]);
  });

  it("brings an app back to the front by its process id and waits until it is there", async () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    const notes = { pid: 777, bundleId: "com.apple.Notes", name: "Notes" };
    fake.state.running.set(777, notes);
    expect(await input.focus("501")).toBe(true);
    expect(fake.state.activated).toEqual([]);
    expect(await input.focus("777")).toBe(true);
    expect(fake.state.activated).toEqual([777]);
    expect(await input.focus("999")).toBe(false);
  });

  it("releases V again when the system takes only the key down", () => {
    const fake = fakeMacNative();
    fake.state.acceptPosts = 1;
    const input = createMacInput(fake.native);
    expect(input.pressPaste("ctrl-v")).toBe(false);
    fake.state.acceptPosts = Infinity;
    expect(createMacInput(fake.native).pressPaste("ctrl-v")).toBe(true);
  });

  it("types text as Unicode events and a newline as Shift+Return", async () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    expect(await finished(input.type("a\r\nb"))).toBe("done");
    expect(fake.state.posted).toEqual([{ units: [97] }, { keycode: 36, down: true, flags: 0x20000 }, { keycode: 36, down: false, flags: 0x20000 }, { units: [98] }]);
  });

  it("stops typing between lines when asked", async () => {
    const fake = fakeMacNative();
    let calls = 0;
    expect(await finished(createMacInput(fake.native).type("a\nb\nc", () => ++calls > 1))).toBe("stopped");
    expect(fake.state.posted).toEqual([{ units: [97] }]);
  });

  it("splits long text into events of at most 20 units and keeps a surrogate pair together", () => {
    const parts = chunks("a".repeat(19) + "😀" + "b");
    expect(parts.map((p) => p.length)).toEqual([19, 3]);
    expect(parts[1]).toEqual([0xd83d, 0xde00, 98]);
    expect(chunks("")).toEqual([]);
    expect(chunks("x".repeat(45)).map((p) => p.length)).toEqual([20, 20, 5]);
  });

  it("stops typing when the system stops taking events", async () => {
    const fake = fakeMacNative();
    fake.state.acceptPosts = 1;
    expect(await finished(createMacInput(fake.native).type("x".repeat(60)))).toBe("rejected");
  });

  it("reports the modifiers held, by name", () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    expect(input.heldModifiers()).toEqual([]);
    fake.state.flags = 0x20000 | 0x100000 | 0x40000; // Shift, Command, Control (Control is not reported)
    expect(input.heldModifiers()).toEqual(["shift", "win"]);
  });

  it("reads secure keyboard input as the password signal and no password field of its own", () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    expect(input.passwordFocused()).toBe(false);
    expect(input.secureInput?.()).toBe(false);
    fake.state.secure = true;
    expect(input.secureInput?.()).toBe(true);
  });
});

describe("macOS pasteboard", () => {
  it("sees a copied file list as files and counts the formats", () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    expect(input.clipboardTraits()).toEqual({ files: false, formats: 0, marks: [] });
    fake.state.types = ["public.utf8-plain-text", "public.file-url"];
    expect(input.clipboardTraits()).toEqual({ files: true, formats: 2, marks: [] });
    expect(input.clipboardSequence()).toBe(1);
  });

  it("marks dictated text as transient and concealed, and reads the marks back", async () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    expect(await input.markClipboard(["CanIncludeInClipboardHistory", "CanUploadToCloudClipboard", "ExcludeClipboardContentFromMonitorProcessing"])).toBe(true);
    expect(fake.state.types).toEqual(["org.nspasteboard.TransientType", "org.nspasteboard.ConcealedType"]);
    expect(input.clipboardTraits().marks).toEqual(["CanIncludeInClipboardHistory", "CanUploadToCloudClipboard", "ExcludeClipboardContentFromMonitorProcessing"]);
  });

  it("restores a password manager's concealed mark alone", async () => {
    const fake = fakeMacNative();
    fake.state.types = ["org.nspasteboard.ConcealedType"];
    expect(createMacInput(fake.native).clipboardTraits().marks).toEqual(["ExcludeClipboardContentFromMonitorProcessing"]);
  });

  it("ignores marks it has no type for and reports a refused write", async () => {
    const fake = fakeMacNative();
    const input = createMacInput(fake.native);
    expect(await input.markClipboard(["Unknown"])).toBe(true);
    expect(await input.markClipboard([])).toBe(true);
    expect(fake.state.types).toEqual([]);
    fake.state.addTypesOk = false;
    expect(await input.markClipboard(["CanIncludeInClipboardHistory"])).toBe(false);
  });
});

describe("macOS insert through the inserter", () => {
  function insertSetup() {
    const fake = fakeMacNative();
    const platform = createMacPlatformWith(fake.native);
    let text = "old";
    const clip: ClipboardPort = {
      snapshot: async () => [text],
      writeText: async (t) => void (text = t),
      restore: async (s) => void (text = (s as string[])[0]!),
      sequence: () => fake.state.seq,
    };
    const ins = createInserter({ input: platform.input, clip, sleep: async () => void (fake.state.flags = 0) });
    return { fake, ins, text: () => text };
  }

  it("pastes with Command+V into a normal app and gives the clipboard back", async () => {
    const t = insertSetup();
    expect(await t.ins.insert("hello")).toEqual({ status: "pasted" });
    expect(t.fake.state.posted.at(0)).toEqual({ keycode: 9, down: true, flags: 0x100000 });
    await t.ins.flush();
    expect(t.text()).toBe("old");
  });

  it("only copies while secure input is on, and sends no keys", async () => {
    const t = insertSetup();
    t.fake.state.secure = true;
    expect(await t.ins.insert("secret")).toEqual({ status: "copied", reason: "secure-input" });
    expect(t.fake.state.posted).toEqual([]);
    expect(t.text()).toBe("secret");
  });

  it("refuses to type into a focused password control and sends no keys", async () => {
    const t = insertSetup();
    t.fake.state.passwordFocused = true;
    expect(await t.ins.insert("secret")).toEqual({ status: "refused", reason: "password-field" });
    expect(t.fake.state.posted).toEqual([]);
  });

  it("only copies when the app changed since the key went down", async () => {
    const t = insertSetup();
    expect(await t.ins.insert("x", { target: "999" })).toEqual({ status: "copied", reason: "foreground-changed" });
  });

  it("waits for Shift, Option and Command to be released before pasting", async () => {
    const t = insertSetup();
    t.fake.state.flags = 0x100000;
    expect(await t.ins.insert("x")).toEqual({ status: "pasted" });
  });
});

describe("macOS mouse buttons as hotkeys", () => {
  const SIDE_BUTTON = 3; // button number 3 is the first side button, reported as Mouse4
  const MOUSE4 = 0x05;

  it("is available, and a bound side button holds the dictation down and up, swallowed as a pair", async () => {
    const t = started([MOUSE4]);
    expect(t.platform.hotkey.mouse).toBe(true);
    expect(t.fake.sendMouse({ type: 25, button: SIDE_BUTTON })).toBe(true);
    expect(t.fake.sendMouse({ type: 26, button: SIDE_BUTTON })).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "up" }]);
  });

  it("does not open the mouse tap while no button is bound", () => {
    const t = started([VK.rightAlt]);
    expect(t.fake.calls.taps).toBe(1);
  });

  it("a click during a keyboard hold discards the press and reaches the app", async () => {
    const t = started([VK.rightAlt]);
    t.fake.send({ type: FLAGS, keycode: RIGHT_OPTION, flags: RIGHT_OPTION_BIT });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.fake.sendMouse({ type: 1, button: 0 })).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.events).toEqual([{ kind: "down" }, { kind: "other", vk: 0x01 }]);
  });

  it("keeps the keyboard shortcut working when macOS refuses only the mouse tap", async () => {
    const fake = fakeMacNative({ refuseMouseTap: true });
    const platform = createMacPlatformWith(fake.native);
    const events: HotkeyEvent[] = [];
    expect(platform.hotkey.start({ keys: [VK.rightAlt, MOUSE4] }, { onEvent: (e) => void events.push(e) })).toEqual({ ok: true });
    expect(fake.calls.taps).toBe(1);
    expect(platform.hotkey.active).toBe(true);
  });
});
