import { describe, expect, it } from "vite-plus/test";
import type { DictationState } from "@speakkit/dictation";
import { errorView, failureLine, hudViewFor, type HudInput } from "./hud-view";

const input = (state: DictationState, over: Partial<HudInput> = {}): HudInput => ({
  state,
  hotkey: "ControlLeft+AltLeft+Space",
  platform: "win32",
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

  it.each([
    ["win32", "Ctrl Alt Space"],
    ["darwin", "Control Option Space"],
  ] as const)("shows a held recording as unlocked, with the level, the start time and the %s key names", (platform, hotkey) => {
    expect(hudViewFor(input({ status: "recording", mode: "hold" }, { platform }))).toEqual({ kind: "recording", locked: false, startedAt: 5, level: 0.4, hotkey });
  });

  it("shows a toggled recording and a locked one as locked", () => {
    expect(hudViewFor(input({ status: "recording", mode: "toggle" }))).toMatchObject({ kind: "recording", locked: true });
    expect(hudViewFor(input({ status: "locked" }))).toMatchObject({ kind: "recording", locked: true });
  });

  it("shows transcribing for both the recognition and the paste", () => {
    expect(hudViewFor(input({ status: "transcribing" }))).toEqual({ kind: "transcribing" });
    expect(hudViewFor(input({ status: "pasting" }))).toEqual({ kind: "transcribing" });
  });

  it("says Sent after an insert, unless the system only managed to copy", () => {
    expect(hudViewFor(input({ status: "idle", notice: { kind: "inserted" } }))).toEqual({ kind: "pasted" });
    expect(hudViewFor(input({ status: "idle", notice: { kind: "inserted" } }, { insertedAsCopy: true }))).toEqual({ kind: "copied", reason: "clipboard" });
  });

  it("says why a copy happened when secure keyboard input blocked the paste", () => {
    expect(hudViewFor(input({ status: "idle", notice: { kind: "inserted" } }, { insertedAsCopy: true, secureInput: true }))).toEqual({ kind: "copied", reason: "secure-input" });
    expect(hudViewFor(input({ status: "idle", notice: { kind: "inserted" } }, { insertedAsCopy: false, secureInput: true }))).toEqual({ kind: "pasted" });
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
    ["mic-silent", "Microphone is muted or too quiet", "sound-settings"],
    ["focus-failed", "Could not return to the app. The text is in History", "copy-last"],
    ["model-missing", "Speech model missing", "download"],
  ])("%s says %s and offers %s", (code, text, action) => {
    expect(errorView(code, false)).toMatchObject({ kind: "error", text, action: { id: action } });
  });

  it("offers Try again only when the audio was kept", () => {
    expect(errorView("transcribe-failed", true)).toMatchObject({ text: "Could not transcribe", action: { label: "Try again", id: "retry" } });
    expect(errorView("transcribe-failed", false)).not.toHaveProperty("action");
  });

  it("offers Try again for a failed insertion without needing a kept recording, because the text is in History", () => {
    expect(errorView("insert-failed", false)).toMatchObject({ text: "Could not insert the text. It is in History", action: { label: "Try again", id: "paste-again" } });
  });

  it("explains the errors that have nothing to press", () => {
    expect(errorView("mic-busy", false)).toMatchObject({ text: "Another app is using the microphone" });
    expect(errorView("password-field", false)).toMatchObject({ icon: "lock", text: "Not typed into a password field" });
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

describe("the last failure on the Settings page", () => {
  it("gives the words of the error and says Try again can run only when a take is kept", () => {
    expect(failureLine("transcribe-failed", true)).toEqual({ text: "Could not transcribe", retry: true });
    expect(failureLine("transcribe-failed", false)).toEqual({ text: "Could not transcribe", retry: false });
  });
  it("has no Try again for an error that has no take to run again", () => {
    expect(failureLine("mic-denied", true)).toEqual({ text: "Microphone access is blocked", retry: false });
    expect(failureLine("insert-failed", true).retry).toBe(false);
  });
  it("names the feature that held the microphone", () => {
    expect(failureLine("mic-in-use", false, "Voice chat")).toEqual({ text: "Voice chat is using the microphone", retry: false });
  });
  it("has plain words for a code it does not know", () => {
    expect(failureLine("nope", true)).toEqual({ text: "Dictation stopped working", retry: false });
  });
});
