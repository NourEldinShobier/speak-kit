import { describe, expect, it } from "vite-plus/test";
import { failureTime, listenerStatus } from "./listener-model";

const base = { supported: true, enabled: true, hotkeyReady: true, mic: { kind: "ready", label: "Yeti" } as const, platform: "win32" };

describe("listenerStatus", () => {
  it("is running when everything is up", () => {
    expect(listenerStatus(base)).toMatchObject({ label: "Running", tone: "ok" });
  });
  it("is stopped when dictation is off, whatever else is wrong", () => {
    expect(listenerStatus({ ...base, enabled: false, mic: { kind: "none" } })).toMatchObject({ label: "Stopped", tone: "off" });
  });
  it("is not available where there is no key hook", () => {
    expect(listenerStatus({ ...base, supported: false, enabled: false })).toMatchObject({ label: "Not available" });
  });
  it("says the shortcut stopped on Windows and that a permission is needed on macOS", () => {
    expect(listenerStatus({ ...base, hotkeyFailed: true })).toMatchObject({ label: "Stopped", tone: "problem" });
    expect(listenerStatus({ ...base, hotkeyFailed: true, platform: "darwin" })).toMatchObject({ label: "Needs permission", tone: "problem" });
  });
  it.each([
    [{ kind: "blocked", privacyLink: true } as const, "Needs permission"],
    [{ kind: "none" } as const, "No microphone"],
    [{ kind: "built-in-off" } as const, "No microphone"],
    [{ kind: "lost" } as const, "No microphone"],
    [{ kind: "reconnecting", attempt: 2 } as const, "Starting"],
    [{ kind: "busy" } as const, "Running"],
    [{ kind: "bluetooth", label: "Buds" } as const, "Running"],
  ])("with the microphone %j it is %s", (mic, label) => {
    expect(listenerStatus({ ...base, mic }).label).toBe(label);
  });
  it("is starting while the shortcut is not live yet", () => {
    expect(listenerStatus({ ...base, hotkeyReady: false })).toMatchObject({ label: "Starting" });
  });
});

describe("failureTime", () => {
  it("gives only the time for today and the date for another day", () => {
    const now = new Date(2026, 5, 10, 15, 0).getTime();
    expect(failureTime(new Date(2026, 5, 10, 10, 32).getTime(), now)).toMatch(/10:32/);
    expect(failureTime(new Date(2026, 5, 10, 10, 32).getTime(), now)).not.toMatch(/Jun/);
    expect(failureTime(new Date(2026, 5, 9, 10, 32).getTime(), now)).toMatch(/9/);
  });
});
