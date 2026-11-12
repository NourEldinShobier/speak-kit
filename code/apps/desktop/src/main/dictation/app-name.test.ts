import { describe, expect, it } from "vite-plus/test";
import { friendlyAppName } from "./app-name";

describe("friendlyAppName", () => {
  it("names well-known programs, in any letter case", () => {
    expect(friendlyAppName("Code.exe")).toBe("Visual Studio Code");
    expect(friendlyAppName("WindowsTerminal.exe")).toBe("Windows Terminal");
    expect(friendlyAppName("MSTSC.EXE")).toBe("Remote Desktop");
  });
  it("splits and capitalizes the rest", () => {
    expect(friendlyAppName("notepad.exe")).toBe("Notepad");
    expect(friendlyAppName("DiscordPTB.exe")).toBe("Discord PTB");
    expect(friendlyAppName("my-cool_app.exe")).toBe("My cool app");
    expect(friendlyAppName("Slack")).toBe("Slack");
  });
  it("is undefined when there is no name", () => {
    expect(friendlyAppName(null)).toBeUndefined();
    expect(friendlyAppName("")).toBeUndefined();
    expect(friendlyAppName(".exe")).toBeUndefined();
  });
});
