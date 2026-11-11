import { describe, expect, it } from "vite-plus/test";
import type { DictationState } from "@speakkit/dictation";
import { errorView, hudViewFor, type HudInput } from "./hud-view";

const input = (state: DictationState, over: Partial<HudInput> = {}): HudInput => ({
  state,
  hotkey: "ControlLeft+AltLeft+Space",
  startedAt: 5,
  level: 0.4,
  insertedAsCopy: false,
  canRetry: false,
  ...over,
});

describe("the HUD for each dictation state", () => {
  it("shows nothing when idle with nothing to say", () => {
    expect(hudViewFor(input({ status: "idle" }))).toBeNull();
  });

  it("shows a held recording as unlocked, with the level and the start time", () => {
    expect(hudViewFor(input({ status: "recording", mode: "hold" }))).toEqual({ kind: "recording", locked: false, startedAt: 5, level: 0.4, hotkey: "Ctrl Alt Space" });
  });

  it("shows a toggled recording and a locked one as locked", () => {
    expect(hudViewFor(input({ status: "recording", mode: "toggle" }))).toMatchObject({ kind: "recording", locked: true });
    expect(hudViewFor(input({ status: "locked" }))).toMatchObject({ kind: "recording", locked: true });
  });

  it("shows transcribing for both the recognition and the paste", () => {
    expect(hudViewFor(input({ status: "transcribing" }))).toEqual({ kind: "transcribing" });
    expect(hudViewFor(input({ status: "pasting" }))).toEqual({ kind: "transcribing" });
  });

  it("says Pasted after an insert, unless the system only managed to copy", () => {
    expect(hudViewFor(input({ status: "idle", notice: { kind: "inserted" } }))).toEqual({ kind: "pasted" });
    expect(hudViewFor(input({ status: "idle", notice: { kind: "inserted" } }, { insertedAsCopy: true }))).toEqual({ kind: "copied", reason: "clipboard" });
  });

  it("tells copying because of admin rights from other copying", () => {
    expect(hudViewFor(input({ status: "idle", notice: { kind: "copied", reason: "elevated" } }))).toEqual({ kind: "copied", reason: "elevated" });
    expect(hudViewFor(input({ status: "idle", notice: { kind: "copied", reason: "focus-changed" } }))).toEqual({ kind: "copied", reason: "clipboard" });
  });

  it("says Cancelled and No speech heard", () => {
    expect(hudViewFor(input({ status: "idle", notice: { kind: "cancelled" } }))).toEqual({ kind: "notice", text: "Cancelled" });
    expect(hudViewFor(input({ status: "idle", notice: { kind: "no-speech" } }))).toEqual({ kind: "notice", text: "No speech heard" });
  });
});

describe("errors", () => {
  it.each([
    ["mic-denied", "Microphone access is blocked", "sound-settings"],
    ["mic-missing", "No microphone found", "sound-settings"],
    ["mic-silent", "The microphone sent no sound", "sound-settings"],
    ["model-missing", "Speech model missing", "download"],
  ])("%s says %s and offers %s", (code, text, action) => {
    expect(errorView(code, false)).toMatchObject({ kind: "error", text, action: { id: action } });
  });

  it("offers Try again only when the audio was kept", () => {
    expect(errorView("transcribe-failed", true)).toMatchObject({ text: "Could not transcribe", action: { label: "Try again", id: "retry" } });
    expect(errorView("transcribe-failed", false)).not.toHaveProperty("action");
  });

  it("explains the errors that have nothing to press", () => {
    expect(errorView("mic-busy", false)).toMatchObject({ text: "Another app is using the microphone" });
    expect(errorView("password-field", false)).toMatchObject({ icon: "lock", text: "Not typed into a password field" });
    expect(errorView("insert-failed", false)).toMatchObject({ text: "Could not insert the text" });
    expect(errorView("hotkey-failed", false)).toMatchObject({ text: "The hotkey could not start" });
    expect(errorView("model-loading", false)).toMatchObject({ icon: "download" });
    expect(errorView("model-loading", false)).not.toHaveProperty("action");
    expect(errorView("model-loading", true)).toMatchObject({ action: { label: "Try again", id: "retry" } });
    expect(errorView("model-failed", true)).toMatchObject({ text: "The speech model could not be loaded", icon: "alert-triangle", action: { id: "retry" } });
    expect(errorView("model-failed", false)).not.toHaveProperty("action");
    expect(errorView("something-new", false)).toMatchObject({ text: "Dictation stopped working" });
  });

  it("comes through the state", () => {
    expect(hudViewFor(input({ status: "error", code: "mic-missing" }))).toMatchObject({ kind: "error", text: "No microphone found" });
  });
});
