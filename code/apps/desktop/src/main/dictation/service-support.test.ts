import { describe, expect, it } from "vite-plus/test";
import { soundSettingsUrl } from "./service-support";

describe("soundSettingsUrl", () => {
  it("opens the microphone page when access is the problem and the sound page otherwise, per system", () => {
    expect(soundSettingsUrl(true, "win32")).toBe("ms-settings:privacy-microphone");
    expect(soundSettingsUrl(false, "win32")).toBe("ms-settings:sound");
    expect(soundSettingsUrl(true, "darwin")).toBe("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
    expect(soundSettingsUrl(false, "darwin")).toBe("x-apple.systempreferences:com.apple.preference.sound");
  });
});
