import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { DictationState } from "@speakkit/dictation";
import type { HudView } from "../../shared/dictation/contract";
import type { Hud, HudState } from "./hud";
import { HudPresenter } from "./hud-presenter";

function setup(over: { canRetry?: boolean; copied?: boolean; indicator?: "top" | "bottom" | "off"; platform?: NodeJS.Platform } = {}) {
  const shown: (HudView | "hide")[] = [];
  const updates: HudView[] = [];
  const hud = {
    show: (s: HudState) => s.kind === "view" && shown.push(s.view),
    update: (s: HudState) => s.kind === "view" && updates.push(s.view),
    hide: () => shown.push("hide"),
  } as unknown as Hud;
  const p = new HudPresenter({
    hud: () => hud,
    hotkey: () => "ControlLeft+AltLeft+Space",
    platform: over.platform ?? "win32",
    canRetry: () => over.canRetry ?? false,
    insertedAsCopy: () => over.copied ?? false,
    indicator: () => over.indicator ?? "bottom",
  });
  return { p, shown, updates };
}
const state = (s: DictationState) => s;

describe("HUD presenter", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("does not flash the HUD for a recording that ends within the settle time (a discarded tap)", () => {
    const { p, shown } = setup();
    p.onState(state({ status: "recording", mode: "hold" }));
    vi.advanceTimersByTime(100);
    p.onState(state({ status: "idle" }));
    vi.advanceTimersByTime(500);
    expect(shown.filter((v) => v !== "hide")).toEqual([]);
  });

  it("draws no recording indicator when it is off, but still shows a failure the person must read", () => {
    const { p, shown } = setup({ indicator: "off" });
    p.onState(state({ status: "recording", mode: "hold" }));
    vi.advanceTimersByTime(300);
    p.onState(state({ status: "transcribing" }));
    p.onState(state({ status: "idle", notice: { kind: "inserted" } }));
    expect(shown.filter((v) => v !== "hide")).toEqual([]);
    p.onState(state({ status: "error", code: "mic-denied" }));
    expect(shown.filter((v) => v !== "hide").map((v) => (v as HudView).kind)).toEqual(["error"]);
  });

  it.each([
    ["win32", "Ctrl Alt Space"],
    ["darwin", "Control Option Space"],
  ] as const)("shows a recording after the settle time, with the time it started and %s key names", (platform, hotkey) => {
    const { p, shown } = setup({ platform });
    vi.setSystemTime(10_000);
    p.onState(state({ status: "recording", mode: "hold" }));
    vi.advanceTimersByTime(200);
    expect(shown).toEqual([{ kind: "recording", locked: false, startedAt: 10_000, level: 0, hotkey }]);
  });

  it("passes the microphone level on while recording, and not otherwise", () => {
    const { p, updates } = setup();
    p.setLevel(0.5);
    expect(updates).toEqual([]);
    p.onState(state({ status: "recording", mode: "hold" }));
    vi.advanceTimersByTime(200);
    p.setLevel(0.7);
    expect(updates).toEqual([expect.objectContaining({ kind: "recording", level: 0.7 })]);
  });

  it("goes from recording to transcribing to Pasted and hides when idle again", () => {
    const { p, shown } = setup();
    p.onState(state({ status: "recording", mode: "hold" }));
    vi.advanceTimersByTime(200);
    p.onState(state({ status: "transcribing" }));
    p.onState(state({ status: "idle", notice: { kind: "inserted" } }));
    p.onState(state({ status: "idle" }));
    expect(shown.map((v) => (v === "hide" ? v : v.kind))).toEqual(["recording", "transcribing", "pasted", "hide"]);
  });

  it("keeps a failure with a button on screen after the core has cleared it, then lets it go", () => {
    const { p, shown } = setup({ canRetry: true });
    p.onState(state({ status: "error", code: "transcribe-failed" }));
    p.onState(state({ status: "idle" }));
    expect(shown.at(-1)).toMatchObject({ kind: "error", action: { id: "retry" } });
    vi.advanceTimersByTime(12_100);
    expect(shown.at(-1)).toBe("hide");
  });

  it("does not keep a failure that has nothing to press", () => {
    const { p, shown } = setup();
    p.onState(state({ status: "error", code: "mic-busy" }));
    p.onState(state({ status: "idle" }));
    expect(shown.at(-1)).toBe("hide");
  });

  it("a new recording replaces a kept failure", () => {
    const { p, shown } = setup();
    p.onState(state({ status: "error", code: "model-missing" }));
    p.onState(state({ status: "recording", mode: "hold" }));
    vi.advanceTimersByTime(200);
    expect(shown.at(-1)).toMatchObject({ kind: "recording" });
  });

  it("dismiss hides a kept failure at once", () => {
    const { p, shown } = setup();
    p.onState(state({ status: "error", code: "model-missing" }));
    p.dismiss();
    p.onState(state({ status: "idle" }));
    expect(shown.at(-1)).toBe("hide");
  });

  it("alert shows the hotkey failure, keeps it past an idle state, and lets it go after twelve seconds", () => {
    const { p, shown } = setup();
    p.alert("hotkey-failed");
    expect(shown.at(-1)).toEqual({ kind: "error", text: "The hotkey could not start", icon: "alert-triangle" });
    p.onState(state({ status: "idle" }));
    expect(shown.at(-1)).toMatchObject({ kind: "error" });
    vi.advanceTimersByTime(12_100);
    expect(shown.at(-1)).toBe("hide");
  });

  it.each([
    ["win32", "Ctrl Alt Space"],
    ["darwin", "Control Option Space"],
  ] as const)("flashes Dictation ready for two seconds, with the hotkey in %s key names", (platform, hotkey) => {
    const { p, shown } = setup({ platform });
    p.flashReady();
    expect(shown).toEqual([{ kind: "ready", hotkey }]);
    vi.advanceTimersByTime(2100);
    expect(shown.at(-1)).toBe("hide");
  });

  it("says Copied when the text only reached the clipboard", () => {
    const { p, shown } = setup({ copied: true });
    p.onState(state({ status: "idle", notice: { kind: "inserted" } }));
    expect(shown.at(-1)).toEqual({ kind: "copied", reason: "clipboard" });
  });

  it.each([
    ["win32", "Ctrl Alt Space"],
    ["darwin", "Control Option Space"],
  ] as const)("says the keyboard was reconnected only while a recording is locked, then goes back to the recording (%s)", (platform, keys) => {
    const { p, shown } = setup({ platform });
    p.reconnected();
    expect(shown).toEqual([]);
    vi.setSystemTime(5_000);
    p.onState(state({ status: "locked" }));
    vi.advanceTimersByTime(200);
    p.reconnected();
    expect(shown.at(-1)).toEqual({ kind: "notice", text: `Keyboard reconnected. Still recording. Press ${keys} to finish.` });
    vi.advanceTimersByTime(4000);
    expect(shown.at(-1)).toMatchObject({ kind: "recording", locked: true });
  });

  it("a toast goes away by itself and a failed one is an error pill", () => {
    const { p, shown } = setup();
    p.toast("Pasted into the window it came from");
    expect(shown.at(-1)).toEqual({ kind: "notice", text: "Pasted into the window it came from" });
    vi.advanceTimersByTime(4000);
    expect(shown.at(-1)).toBe("hide");
    p.toast("Nothing was pasted, the text stays on the clipboard", "error");
    expect(shown.at(-1)).toMatchObject({ kind: "error", text: "Nothing was pasted, the text stays on the clipboard" });
  });
});
