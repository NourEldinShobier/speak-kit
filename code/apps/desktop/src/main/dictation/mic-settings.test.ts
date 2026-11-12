import { describe, expect, it, vi } from "vite-plus/test";

const open = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("electron", () => ({ shell: { openExternal: open } }));

import { openMicrophoneSettings } from "./mic-settings";

describe("openMicrophoneSettings", () => {
  it("opens the microphone page of Windows and of macOS, and nothing elsewhere", async () => {
    await openMicrophoneSettings("win32");
    await openMicrophoneSettings("darwin");
    await openMicrophoneSettings("linux");
    expect(open.mock.calls).toEqual([["ms-settings:privacy-microphone"], ["x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"]]);
  });
});
