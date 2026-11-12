import { describe, expect, it } from "vitest";
import { VK, type HotkeyHandlers, type HotkeySource } from "../../dictation/types";
import { captureHotkey } from "./hotkey";
import type { GestureEvent } from "./index";

function fakeSource() {
  const s = {
    active: false as boolean,
    chord: undefined as readonly number[] | undefined,
    handlers: undefined as HotkeyHandlers | undefined,
    resynced: 0,
    start(chord, handlers) {
      s.active = true;
      s.chord = chord.keys;
      s.handlers = handlers;
      return { ok: true } as const;
    },
    stop() {
      s.active = false;
    },
    grab() {},
    resync() {
      s.resynced++;
    },
  } satisfies HotkeySource & Record<string, unknown>;
  return s;
}

describe("capture hotkey", () => {
  it("hooks the chord by its virtual keys and reports press, release and Esc", () => {
    const src = fakeSource();
    const events: GestureEvent[] = [];
    expect(captureHotkey(src).start("F9", (e) => events.push(e))).toEqual({ ok: true });
    expect(src.chord).toEqual([0x78]);
    src.handlers!.onEvent({ kind: "down" });
    src.handlers!.onEvent({ kind: "other", vk: VK.escape });
    src.handlers!.onEvent({ kind: "other", vk: 0x41 });
    src.handlers!.onEvent({ kind: "grabbed", vk: VK.escape });
    src.handlers!.onEvent({ kind: "up" });
    expect(events).toEqual([{ kind: "down" }, { kind: "escape" }, { kind: "escape" }, { kind: "up" }]);
  });
  it("hooks a chord of several keys", () => {
    const src = fakeSource();
    captureHotkey(src).start("ControlLeft+ShiftLeft+F9", () => {});
    expect(src.chord).toEqual([0xa2, 0xa0, 0x78]);
  });
  it("refuses a key it does not know and does not hook anything", () => {
    const src = fakeSource();
    expect(captureHotkey(src).start("Nope", () => {})).toEqual({ ok: false, reason: "invalid-hotkey" });
    expect(src.active).toBe(false);
  });
  it("stops and resyncs the hook", () => {
    const src = fakeSource();
    const h = captureHotkey(src);
    h.start("F9", () => {});
    expect(h.active).toBe(true);
    h.resync();
    h.stop();
    expect([src.resynced, h.active]).toEqual([1, false]);
  });
});
