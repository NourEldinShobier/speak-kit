import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_DICTATION } from "../../shared/dictation/settings";
import { coreSettings, keepOpenMs, shouldRetryHotkey, soundSettingsUrl, touchesMicrophone, windowShown } from "./service-support";

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

describe("shouldRetryHotkey", () => {
  it.each([
    [{ failed: true, enabled: true, permitted: true }, true],
    [{ failed: false, enabled: true, permitted: true }, false],
    [{ failed: true, enabled: false, permitted: true }, false],
    [{ failed: true, enabled: true, permitted: false }, false],
  ])("%j gives %s", (input, expected) => {
    expect(shouldRetryHotkey(input)).toBe(expected);
  });
});

describe("coreSettings", () => {
  it("maps the three output options to the insert mode and the keep flag", () => {
    expect(coreSettings({ ...DEFAULT_DICTATION, output: "restore" })).toMatchObject({ insertMode: "paste", keepOnClipboard: false });
    expect(coreSettings({ ...DEFAULT_DICTATION, output: "keep" })).toMatchObject({ insertMode: "paste", keepOnClipboard: true });
    expect(coreSettings({ ...DEFAULT_DICTATION, output: "copy" })).toMatchObject({ insertMode: "copy", keepOnClipboard: false });
  });

  it("hands over keep-ready", () => {
    expect(coreSettings({ ...DEFAULT_DICTATION, keepReady: true })).toMatchObject({ keepReady: true });
  });
});

describe("keepOpenMs", () => {
  it("is 0 when released when idle and -1 (open while dictation is on) when kept ready", () => {
    expect(keepOpenMs({ keepReady: false })).toBe(0);
    expect(keepOpenMs({ keepReady: true })).toBe(-1);
  });
});

describe("touchesMicrophone", () => {
  it("is true for the settings that decide which microphone is open and whether it stays open", () => {
    for (const k of ["keepReady", "microphone", "avoidBluetooth"]) expect(touchesMicrophone({ [k]: 1 })).toBe(true);
    expect(touchesMicrophone({ output: "copy", hotkey: "F8" })).toBe(false);
    expect(touchesMicrophone({})).toBe(false);
  });
});

describe("windowShown", () => {
  const win = (o: { gone?: boolean; visible?: boolean; minimized?: boolean }) => ({ isDestroyed: () => !!o.gone, isVisible: () => o.visible ?? true, isMinimized: () => !!o.minimized });
  it("is true only for a window that is on screen", () => {
    expect(windowShown(win({}))).toBe(true);
    expect(windowShown(win({ visible: false }))).toBe(false);
    expect(windowShown(win({ minimized: true }))).toBe(false);
    expect(windowShown(win({ gone: true }))).toBe(false);
    expect(windowShown(null)).toBe(false);
  });
});
