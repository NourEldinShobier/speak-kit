import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HotkeyHandlers, HotkeySource } from "../dictation/types";
import type { GestureAction } from "./gesture";
import type { ShiftAction } from "./gesture/shift-ink";
import { CaptureKeys } from "./keys";

function fakeSource() {
  const s = {
    active: false,
    chord: [] as readonly number[],
    extra: undefined as Record<string, { keys: readonly number[] }> | undefined,
    handlers: undefined as HotkeyHandlers | undefined,
    stopped: 0,
    start(chord: { keys: readonly number[] }, handlers: HotkeyHandlers) {
      s.active = true;
      s.chord = chord.keys;
      s.handlers = handlers;
      return { ok: true } as const;
    },
    setExtraChords(c: Record<string, { keys: readonly number[] }>) {
      s.extra = c;
    },
    stop() {
      s.active = false;
      s.stopped++;
    },
    grab() {},
    resync() {},
  };
  return s;
}

function setup(recording = true, onRecord = vi.fn(), onReplay = vi.fn()) {
  const sources: ReturnType<typeof fakeSource>[] = [];
  const actions: (GestureAction | ShiftAction)[] = [];
  const state = { recording };
  const keys = new CaptureKeys({
    open: async () => {
      const s = fakeSource();
      sources.push(s);
      return s as unknown as HotkeySource;
    },
    recording: () => state.recording,
    onAction: (a) => actions.push(a),
    onShot: () => {},
    onRecord,
    onReplay,
    log: () => {},
  });
  return { keys, sources, actions, state, onRecord, onReplay };
}

describe("capture keys: Shift draws", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hooks Shift (left, and right as a second chord) only when drawing with Shift is on", async () => {
    const off = setup();
    await off.keys.apply(true, { capture: "F9", screenshot: undefined });
    expect(off.sources).toHaveLength(1);
    const on = setup();
    await on.keys.apply(true, { capture: "F9", screenshot: undefined, shiftInk: true });
    expect(on.sources).toHaveLength(2);
    expect(on.sources[1]!.chord).toEqual([0xa0]);
    expect(on.sources[1]!.extra).toEqual({ right: { keys: [0xa1] } });
  });

  it("holding Shift alone during a recording starts ink and releasing it ends ink", async () => {
    const t = setup();
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, shiftInk: true });
    t.sources[1]!.handlers!.onEvent({ kind: "down" });
    await vi.advanceTimersByTimeAsync(450);
    expect(t.actions).toEqual(["ink-start"]);
    t.sources[1]!.handlers!.onEvent({ kind: "up" });
    expect(t.actions).toEqual(["ink-start", "ink-end"]);
  });

  it("Shift with another key draws nothing", async () => {
    const t = setup();
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, shiftInk: true });
    t.sources[1]!.handlers!.onEvent({ kind: "down" });
    t.sources[1]!.handlers!.onEvent({ kind: "other", vk: 0x41 });
    await vi.advanceTimersByTimeAsync(1000);
    t.sources[1]!.handlers!.onEvent({ kind: "up" });
    expect(t.actions).toEqual([]);
  });

  it("Shift outside a recording draws nothing", async () => {
    const t = setup(false);
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, shiftInk: true });
    t.sources[1]!.handlers!.onEvent({ kind: "down" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.actions).toEqual([]);
  });

  it("turning it off stops the Shift hook, and stop() stops both", async () => {
    const t = setup();
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, shiftInk: true });
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, shiftInk: false });
    expect(t.sources[1]!.stopped).toBe(1);
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, shiftInk: true });
    t.keys.stop();
    expect(t.sources.every((s) => !s.active)).toBe(true);
  });
});

describe("capture keys: screen recording key", () => {
  it("hooks the key only when it is given, and reports its release", async () => {
    const t = setup();
    await t.keys.apply(true, { capture: "F9", screenshot: undefined });
    expect(t.sources).toHaveLength(1);
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, recording: "F7" });
    expect(t.sources).toHaveLength(2);
    t.sources[1]!.handlers!.onEvent({ kind: "down" });
    expect(t.onRecord).not.toHaveBeenCalled();
    t.sources[1]!.handlers!.onEvent({ kind: "up" });
    expect(t.onRecord).toHaveBeenCalledOnce();
  });

  it("stops the hook when the key is no longer given, and with stop()", async () => {
    const t = setup();
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, recording: "F7" });
    await t.keys.apply(true, { capture: "F9", screenshot: undefined });
    expect(t.sources[1]!.stopped).toBe(1);
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, recording: "F7" });
    t.keys.stop();
    expect(t.sources.every((s) => !s.active)).toBe(true);
  });
});

describe("capture keys: replay key", () => {
  it("hooks the key only when it is given, and reports its release", async () => {
    const t = setup();
    await t.keys.apply(true, { capture: "F9", screenshot: undefined });
    expect(t.sources).toHaveLength(1);
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, replay: "F6" });
    expect(t.sources).toHaveLength(2);
    t.sources[1]!.handlers!.onEvent({ kind: "down" });
    expect(t.onReplay).not.toHaveBeenCalled();
    t.sources[1]!.handlers!.onEvent({ kind: "up" });
    expect(t.onReplay).toHaveBeenCalledOnce();
    expect(t.onRecord).not.toHaveBeenCalled();
  });

  it("stops the hook when the key is no longer given, and with stop()", async () => {
    const t = setup();
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, replay: "F6" });
    await t.keys.apply(true, { capture: "F9", screenshot: undefined });
    expect(t.sources[1]!.stopped).toBe(1);
    await t.keys.apply(true, { capture: "F9", screenshot: undefined, replay: "F6" });
    t.keys.stop();
    expect(t.sources.every((s) => !s.active)).toBe(true);
  });
});
