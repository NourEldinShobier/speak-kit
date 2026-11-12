import { describe, expect, it } from "vite-plus/test";
import { soundSettingsUrl } from "./service-support";

describe("soundSettingsUrl", () => {
  it("opens the microphone privacy pane when the system blocked the microphone, the sound page otherwise", () => {
    expect(soundSettingsUrl("win32", true)).toBe("ms-settings:privacy-microphone");
    expect(soundSettingsUrl("win32", false)).toBe("ms-settings:sound");
    expect(soundSettingsUrl("darwin", true)).toBe("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
    expect(soundSettingsUrl("darwin", false)).toBe("x-apple.systempreferences:com.apple.Sound-Settings.extension");
  });

  it("has no page on other systems", () => {
    expect(soundSettingsUrl("linux", true)).toBeNull();
  });
});
