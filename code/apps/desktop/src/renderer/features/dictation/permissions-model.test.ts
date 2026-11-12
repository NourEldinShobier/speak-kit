import { describe, expect, it } from "vite-plus/test";
import type { GuideStep } from "../../../shared/permissions/guide";
import { hotkeyFailedCopy, stepButton, stepStatus } from "./permissions-model";

const step = (over: Partial<GuideStep>): GuideStep => ({ id: "input-monitoring", state: "not-determined", action: "request", ...over });

describe("permission steps", () => {
  it("offers Allow before the prompt was shown and Open settings after a refusal", () => {
    expect(stepButton(step({}))).toBe("Allow");
    expect(stepButton(step({ state: "denied", action: "open-settings" }))).toBe("Open settings");
    expect(stepButton(step({ state: "granted", action: "none" }))).toBeNull();
  });

  it("words each state", () => {
    expect(stepStatus(step({ state: "granted", action: "none" }))).toBe("Allowed");
    expect(stepStatus(step({ state: "denied", action: "open-settings" }))).toBe("Blocked");
    expect(stepStatus(step({ state: "restricted", action: "open-settings" }))).toBe("Restricted by your administrator");
    expect(stepStatus(step({}))).toBe("Not allowed yet");
  });
});

describe("hotkey failed copy", () => {
  it("names the missing permission on a Mac", () => {
    expect(hotkeyFailedCopy("darwin", step({ id: "accessibility" }))).toEqual({
      title: "Allow Speak Kit to see the hotkey",
      text: "Dictation needs Accessibility in System Settings. The hotkey starts by itself once you allow it.",
    });
  });

  it("keeps the restart advice when the cause is not a permission, and on Windows", () => {
    expect(hotkeyFailedCopy("darwin", null).title).toBe("The hotkey could not start");
    expect(hotkeyFailedCopy("darwin", step({ id: "microphone" })).title).toBe("The hotkey could not start");
    expect(hotkeyFailedCopy("win32", step({})).text).toContain("restart Speak Kit");
  });
});
