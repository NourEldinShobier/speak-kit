import { describe, expect, it } from "vite-plus/test";
import { manualInstallCommand } from "../cli-path/manual";
import { openTryCommand, terminalLaunch, type Terminal } from "./index";

describe("opening a terminal", () => {
  it("on Windows opens a window with cmd that stays open, with the folder in front of that window's PATH", () => {
    const l = terminalLaunch({ platform: "win32", command: "speakkit status --json", extraPath: "C:\\Apps\\Speak Kit\\bin", env: { Path: "C:\\Windows", HOME: "x" } });
    expect(l).toEqual({
      file: "cmd.exe",
      args: ["/d", "/c", "start", "Speak Kit", "cmd.exe", "/k", "speakkit", "status", "--json"],
      env: { Path: "C:\\Apps\\Speak Kit\\bin;C:\\Windows", HOME: "x" },
    });
  });

  it("on Windows leaves the environment alone when there is no folder to add", () => {
    expect(terminalLaunch({ platform: "win32", command: "speakkit status", extraPath: undefined, env: { PATH: "C:\\a" } })?.env).toEqual({ PATH: "C:\\a" });
  });

  it("on macOS asks Terminal to run the command with the folder on its PATH, escaping quotes", () => {
    const l = terminalLaunch({ platform: "darwin", command: "speakkit status --json", extraPath: '/Apps/My "Kit"/bin', env: { PATH: "/usr/bin" } });
    expect(l?.file).toBe("osascript");
    expect(l?.args).toEqual([
      "-e",
      `tell application "Terminal" to do script "export PATH='/Apps/My \\"Kit\\"/bin':\\"$PATH\\"; speakkit status --json"`,
      "-e",
      'tell application "Terminal" to activate',
    ]);
  });

  it("is not available on other systems", () => {
    expect(terminalLaunch({ platform: "linux", command: "speakkit status", extraPath: undefined, env: {} })).toBeUndefined();
  });
});

describe("the command to install by hand", () => {
  it("on Windows adds the folder to the user PATH from PowerShell, with a quote in the folder doubled", () => {
    expect(manualInstallCommand("win32", "C:\\Apps\\O'Neil\\bin")).toBe(
      "[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';' + 'C:\\Apps\\O''Neil\\bin', 'User')",
    );
  });

  it("on macOS writes the two-line launcher into the person's own folder", () => {
    expect(manualInstallCommand("darwin", "/Applications/Speak Kit.app/Contents/Resources/bin")).toBe(
      "mkdir -p ~/.local/bin && printf '#!/bin/sh\\nexec \"%s\" \"$@\"\\n' '/Applications/Speak Kit.app/Contents/Resources/bin/speakkit' > ~/.local/bin/speakkit && chmod +x ~/.local/bin/speakkit",
    );
  });

  it("is null without a shipped launcher or on other systems", () => {
    expect(manualInstallCommand("win32", undefined)).toBeNull();
    expect(manualInstallCommand("linux", "/x")).toBeNull();
  });
});

describe("trying the command", () => {
  const rig = () => {
    const opened: [string, string | undefined][] = [];
    const terminal: Terminal = { open: async (c, p) => void opened.push([c, p]) };
    return { opened, terminal };
  };
  it("opens a terminal with the try command and the launcher folder once the tool is installed or only needs the PATH", async () => {
    const r = rig();
    await openTryCommand({ kind: "installed", where: "C:\bin" }, r.terminal, "C:\bin");
    await openTryCommand({ kind: "needs-path", where: "/h/.local/bin/speakkit", folder: "/h/.local/bin" }, r.terminal, "/app/bin");
    expect(r.opened).toEqual([
      ["speakkit status --json", "C:\bin"],
      ["speakkit status --json", "/app/bin"],
    ]);
  });
  it("refuses, and opens nothing, when the tool is not installed, needs repair or is not available", async () => {
    const r = rig();
    for (const line of [{ kind: "not-installed" }, { kind: "needs-repair", why: "x" }, { kind: "unavailable", reason: "x" }] as const)
      await expect(openTryCommand(line, r.terminal, "/b")).rejects.toThrow("not installed");
    expect(r.opened).toEqual([]);
  });
});
