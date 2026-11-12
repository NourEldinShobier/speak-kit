import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { CaptureConfigSchema } from "../../shared/capture/settings";
import { applyPatch } from "./settings-patch";

const config = () => v.parse(CaptureConfigSchema, {});
const ctx = { dictationHotkey: "ControlRight", os: "win32" };

describe("capture settings change", () => {
  it("takes a free hotkey and asks for the hooks to restart", () => {
    const s = config();
    expect(applyPatch(s, { hotkey: "F8" }, ctx)).toEqual({ note: undefined, keysChanged: true });
    expect(s.hotkey).toBe("F8");
  });
  it("refuses the dictation key and says whose it is, keeping the old key", () => {
    const s = config();
    expect(applyPatch(s, { hotkey: "ControlRight" }, ctx).note).toBe("Right Ctrl belongs to Dictation");
    expect(s.hotkey).toBe("F9");
  });
  it("refuses a chord that holds the dictation key", () => {
    expect(applyPatch(config(), { hotkey: "ControlRight+F9" }, ctx).note).toBe("Right Ctrl belongs to Dictation");
  });
  it("does not check against dictation when dictation is off", () => {
    const s = config();
    expect(applyPatch(s, { hotkey: "ControlRight" }, { ...ctx, dictationHotkey: undefined }).note).toBeUndefined();
    expect(s.hotkey).toBe("ControlRight");
  });
  it("keeps the two capture keys apart", () => {
    const s = config();
    expect(applyPatch(s, { screenshotHotkey: "F9" }, ctx).note).toBe("The two capture keys cannot be the same");
    expect(s.screenshotHotkey).toBe("F10");
  });
  it("keeps the screen recording key apart from the other two and from dictation", () => {
    const s = config();
    expect(s.recordingHotkey).toBe("F7");
    expect(applyPatch(s, { recordingHotkey: "F9" }, ctx).note).toBe("The two capture keys cannot be the same");
    expect(applyPatch(s, { recordingHotkey: "F10" }, ctx).note).toBe("The two capture keys cannot be the same");
    expect(applyPatch(s, { recordingHotkey: "ControlRight" }, ctx).note).toBe("Right Ctrl belongs to Dictation");
    expect(s.recordingHotkey).toBe("F7");
    expect(applyPatch(s, { recordingHotkey: "F6" }, ctx)).toEqual({ note: undefined, keysChanged: true });
    expect(s.recordingHotkey).toBe("F6");
  });
  it("refuses to move the capture key onto the screen recording key", () => {
    const s = config();
    expect(applyPatch(s, { hotkey: "F7" }, ctx).note).toBe("The two capture keys cannot be the same");
    expect(s.hotkey).toBe("F9");
  });
  it("changes plain settings without restarting the hooks, and experiments with a restart", () => {
    const s = config();
    expect(applyPatch(s, { narration: false, retentionDays: 7 }, ctx)).toEqual({ note: undefined, keysChanged: false });
    expect([s.narration, s.retentionDays]).toEqual([false, 7]);
    expect(applyPatch(s, { experiments: { screenshots: true } }, ctx).keysChanged).toBe(true);
    expect([s.experiments.screenshots, s.experiments.playground]).toEqual([true, false]);
  });
  it("keeps the replay key apart from the other capture keys and from dictation", () => {
    const s = config();
    expect(applyPatch(s, { replayHotkey: "F9" }, ctx).note).toBe("The two capture keys cannot be the same");
    expect(applyPatch(s, { replayHotkey: "ControlRight" }, ctx).note).toBe("Right Ctrl belongs to Dictation");
    expect(s.replayHotkey).toBe("F11");
    expect(applyPatch(s, { replayHotkey: "F5" }, ctx)).toEqual({ note: undefined, keysChanged: true });
    expect(s.replayHotkey).toBe("F5");
    expect(applyPatch(s, { hotkey: "F5" }, ctx).note).toBe("The two capture keys cannot be the same");
  });
  it("asks for the hooks and the buffer to start again when the buffer is turned on or off", () => {
    const s = config();
    expect(applyPatch(s, { replayBuffer: true }, ctx)).toEqual({ note: undefined, keysChanged: true });
    expect(s.replayBuffer).toBe(true);
    expect(applyPatch(s, { retentionDays: 7 }, ctx).keysChanged).toBe(false);
  });
});
