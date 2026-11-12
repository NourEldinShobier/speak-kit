import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { capsuleView, clock } from "./capsule";
import { noticeFor, noticeOfError } from "./notices";
import { AUTO_SEND, autoSendSeconds, CAPTURE_HOTKEY, CaptureConfigSchema, CapturePatchSchema } from "./settings";
import { parseConfig } from "../schemas";

describe("capture settings", () => {
  it("send to Voice chat is off by default, keeps the old 3 second value, and falls back on a bad one", () => {
    expect(parseConfig({ setupDone: true }).capture.autoSend).toBe("off");
    expect(v.parse(CaptureConfigSchema, { autoSend: "3s" }).autoSend).toBe("3s");
    expect(v.parse(CaptureConfigSchema, { autoSend: "10s" }).autoSend).toBe("10s");
    expect(v.parse(CaptureConfigSchema, { autoSend: "2m" }).autoSend).toBe("off");
  });
  it("turns the setting into seconds", () => {
    expect(AUTO_SEND.map(autoSendSeconds)).toEqual([0, 3, 5, 10]);
  });
  it("an old config without a capture section loads with defaults (off, F9, 30 days)", () => {
    const c = parseConfig({ setupDone: true }).capture;
    expect(c).toMatchObject({ enabled: false, hotkey: "F9", screenshotHotkey: "F10", target: "ask", narration: true, retentionDays: 30, inputLog: "events", consented: false, lastTargets: {} });
    expect(c.experiments).toEqual({ screenshots: false, recording: false, replay: false, zoomExport: false, agentContext: false, pageContext: false, speechEngines: false, playground: false });
  });
  it("bad values fall back one by one and the rest stay", () => {
    const c = v.parse(CaptureConfigSchema, { enabled: true, hotkey: "KeyA", retentionDays: 5, inkFadeMs: "x", folder: "D:/caps" });
    expect([c.enabled, c.hotkey, c.retentionDays, c.inkFadeMs, c.folder]).toEqual([true, CAPTURE_HOTKEY, 30, 1000, "D:/caps"]);
  });
  it("the patch refuses unknown keys and bad hotkeys", () => {
    expect(v.safeParse(CapturePatchSchema, { hotkey: "F8" }).success).toBe(true);
    expect(v.safeParse(CapturePatchSchema, { hotkey: "KeyA" }).success).toBe(false);
    expect(v.safeParse(CapturePatchSchema, { evil: true }).success).toBe(false);
    expect(v.safeParse(CapturePatchSchema, { experiments: { recording: true } }).success).toBe(true);
    expect(v.safeParse(CapturePatchSchema, { experiments: { nope: true } }).success).toBe(false);
  });
});

describe("notices", () => {
  it("each failure says what happened and offers one next step", () => {
    expect(noticeFor("nothing-recorded")).toMatchObject({ title: "Nothing was recorded", action: "retry", actionLabel: "Try again" });
    expect(noticeFor("no-space", { drive: "C:" }).body).toBe("Free up space on C: or choose another folder for captures.");
    expect(noticeFor("cleaned-up", { count: 3, days: 30 })).toMatchObject({
      title: "Cleaned up 3 old captures",
      body: "They were older than 30 days and moved to the Recycle Bin.",
      actionLabel: "Open Recycle Bin",
    });
    expect(noticeFor("cleaned-up", { count: 1, os: "darwin" })).toMatchObject({ title: "Cleaned up 1 old capture", actionLabel: "Open Trash" });
  });
  it("maps errors to notices without leaking their text", () => {
    expect(noticeOfError(Object.assign(new Error("write failed"), { code: "ENOSPC" })).code).toBe("no-space");
    expect(noticeOfError(new Error("NotAllowedError")).code).toBe("permission-denied");
    expect(noticeOfError(new Error("zero-frames")).code).toBe("nothing-recorded");
    const other = noticeOfError(new Error("ECONNRESET 10.0.0.1:443"));
    expect(other.code).toBe("failed");
    expect(JSON.stringify(other)).not.toContain("ECONNRESET");
    expect(noticeOfError("plain string").code).toBe("failed");
  });
});

describe("capsule view", () => {
  it("shows target, timer, pen, stop and discard while recording", () => {
    const v = capsuleView({ kind: "recording", target: "Figma · Pricing page", elapsedMs: 65_400, pen: false });
    expect(v).toMatchObject({ chip: "Figma · Pricing page", text: "Recording", timer: "1:05", live: true });
    expect(v.buttons.map((b) => b.id)).toEqual(["pen", "stop", "discard"]);
  });
  it("marks the pen pressed, and says when the microphone is missing or dictation paused", () => {
    expect(capsuleView({ kind: "recording", target: "t", elapsedMs: 0, pen: true }).buttons[0]).toMatchObject({ pressed: true });
    expect(capsuleView({ kind: "recording", target: "t", elapsedMs: 0, pen: false, micMissing: true })).toMatchObject({ text: "No microphone. Recording the screen only.", tone: "warning" });
    expect(capsuleView({ kind: "recording", target: "t", elapsedMs: 0, pen: false, dictationPaused: true }).text).toBe("Dictation is paused while recording");
  });
  it("asks before discarding", () => {
    expect(capsuleView({ kind: "recording", target: "t", elapsedMs: 5, pen: false, confirmDiscard: true })).toMatchObject({ text: "Discard this recording?", live: false });
  });
  it("shows the finishing steps in order", () => {
    const v = capsuleView({
      kind: "finishing",
      target: "t",
      steps: [
        { label: "Video saved", state: "done" },
        { label: "Writing the words...", state: "active" },
        { label: "Copying", state: "waiting" },
      ],
    });
    expect(v.text).toBe("Writing the words...");
    expect(v.steps).toHaveLength(3);
  });
  it("countdown offers Hold and Undo; held offers Send now and Undo", () => {
    expect(capsuleView({ kind: "countdown", target: "t", secondsLeft: 3 })).toMatchObject({ text: "Sending to Voice chat in 3" });
    expect(capsuleView({ kind: "countdown", target: "t", secondsLeft: 3, held: true }).buttons.map((b) => b.id)).toEqual(["send-now", "undo"]);
  });
  it("after sending, Undo is disabled and the capsule says plainly why", () => {
    const v = capsuleView({ kind: "sent", target: "t", destination: "Voice chat", canUndo: false });
    expect(v.buttons[0]).toMatchObject({ id: "undo", disabled: true });
    expect(v.detail).toBe("Voice chat already has the capture and cannot take it back.");
  });
  it("a failure shows the plain reason and its one next step", () => {
    expect(capsuleView({ kind: "failed", target: "t", notice: noticeFor("send-failed") })).toMatchObject({
      text: "Couldn't send to Voice chat",
      tone: "error",
      buttons: [{ id: "retry", label: "Try again" }],
    });
  });
  it("sent and undone states can be closed", () => {
    expect(capsuleView({ kind: "sent", target: "t", destination: "Voice chat", canUndo: true }).buttons.map((b) => [b.id, !!b.disabled])).toEqual([
      ["undo", false],
      ["dismiss", false],
    ]);
    expect(capsuleView({ kind: "undone", target: "t" }).buttons.map((b) => b.id)).toEqual(["open", "dismiss"]);
  });
  it("formats the timer", () => {
    expect([clock(0), clock(59_999), clock(600_000), clock(-5)]).toEqual(["0:00", "0:59", "10:00", "0:00"]);
  });
});
