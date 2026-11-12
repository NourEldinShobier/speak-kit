import { describe, expect, it } from "vite-plus/test";
import { createLauncher, terminalCommand, type LauncherDeps } from ".";
import { addDir, hasDir, removeDir } from "./path-list";
import { isOurShim, shimText } from "./shim";

function fakeDeps(platform: "win32" | "darwin", over: { userPath?: string; writable?: string[]; files?: Record<string, string>; envPath?: string } = {}) {
  const files = { ...over.files };
  let userPath = over.userPath ?? "";
  const writes: string[] = [];
  const deps: LauncherDeps = {
    platform,
    execPath: platform === "win32" ? "C:\\Apps\\Speak Kit\\Speak Kit.exe" : "/Applications/Speak Kit.app/Contents/MacOS/Speak Kit",
    script: platform === "win32" ? "C:\\Apps\\Speak Kit\\resources\\app\\dist\\main\\cli.js" : "/Applications/Speak Kit.app/Contents/Resources/app/dist/main/cli.js",
    home: platform === "win32" ? "C:\\Users\\me" : "/Users/me",
    dataDir: "C:\\Users\\me\\AppData\\Roaming\\@speakkit\\desktop",
    envPath: over.envPath ?? "/usr/bin:/bin",
    fs: {
      read: async (f) => files[f] ?? null,
      write: async (f, t) => void (writes.push(f), (files[f] = t)),
      remove: async (f) => void delete files[f],
      canWrite: async (d) => (over.writable ?? ["/usr/local/bin", "/Users/me/.local/bin"]).includes(d),
    },
    userPath: { read: async () => userPath, write: async (v) => void (userPath = v) },
  };
  return { deps, files, writes, userPath: () => userPath };
}
const BIN = "C:\\Users\\me\\AppData\\Roaming\\@speakkit\\desktop\\bin";
const CMD = `${BIN}\\speakkit.cmd`;

describe("path list", () => {
  it("compares Windows folders without case or a trailing slash", () => {
    expect(hasDir("C:\\a;C:\\Bin\\", "c:\\bin", true)).toBe(true);
    expect(hasDir("C:\\a;C:\\Bin", "c:\\bin", false)).toBe(false);
  });
  it("adds once and removes only that folder", () => {
    expect(addDir("C:\\a", "C:\\b", true)).toBe("C:\\a;C:\\b");
    expect(addDir("C:\\a;C:\\B", "c:\\b", true)).toBe("C:\\a;C:\\B");
    expect(addDir("", "C:\\b", true)).toBe("C:\\b");
    expect(removeDir("C:\\a;%USERPROFILE%\\x;C:\\b", "C:\\b", true)).toBe("C:\\a;%USERPROFILE%\\x");
    expect(removeDir("/a:/b", "/b", false)).toBe("/a");
    expect(removeDir("/a", "/b", false)).toBe("/a");
  });
});

describe("shim text", () => {
  it("runs the app executable as node on cli.js and passes the exit code on (Windows)", () => {
    const t = shimText("win32", { execPath: "C:\\Apps\\100%\\App.exe", script: "C:\\x\\cli.js" });
    expect(t).toBe('@echo off\r\nrem speakkit launcher\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n"C:\\Apps\\100%%\\App.exe" "C:\\x\\cli.js" %*\r\nexit /b %ERRORLEVEL%\r\n');
  });
  it("is a shell script that execs it, with quoting for odd paths (macOS)", () => {
    expect(shimText("darwin", { execPath: '/Apps/My "App"/Speak Kit', script: "/a b/$cli.js" })).toBe(
      '#!/bin/sh\n# speakkit launcher\nELECTRON_RUN_AS_NODE=1 exec "/Apps/My \\"App\\"/Speak Kit" "/a b/\\$cli.js" "$@"\n',
    );
  });
  it("is recognised as ours", () => {
    expect(isOurShim(shimText("darwin", { execPath: "/a", script: "/b" }))).toBe(true);
    expect(isOurShim("#!/bin/sh\necho mine\n")).toBe(false);
  });
});

describe("terminal command", () => {
  it("opens cmd on Windows and Terminal on macOS", () => {
    expect(terminalCommand("win32", "speakkit status")).toEqual({ file: "cmd.exe", args: ["/c", "start", "Speak Kit", "cmd", "/k", "speakkit status"] });
    expect(terminalCommand("win32", "speakkit status", "C:\\Users\\Ann Lee\\bin")).toEqual({
      file: "cmd.exe",
      args: ["/c", "start", "Speak Kit", "/D", "C:\\Users\\Ann Lee\\bin", "cmd", "/k", "speakkit status"],
    });
    expect(terminalCommand("darwin", 'speakkit speak "hi"')).toEqual({
      file: "osascript",
      args: ["-e", 'tell application "Terminal" to do script "speakkit speak \\"hi\\""', "-e", 'tell application "Terminal" to activate'],
    });
  });
});

describe("Windows launcher", () => {
  it("is not installed on a clean machine", async () => {
    const t = fakeDeps("win32");
    expect(await (await createLauncher(t.deps)).inspect()).toEqual({ state: "not-installed", dir: BIN, file: CMD, onPath: false, needsNewTerminal: false });
  });
  it("install writes speakkit.cmd and appends the folder to the user PATH, keeping what was there", async () => {
    const t = fakeDeps("win32", { userPath: "C:\\Tools;%USERPROFILE%\\bin" });
    const r = await (await createLauncher(t.deps)).install();
    expect(r).toEqual({ state: "installed", dir: BIN, file: CMD, onPath: true, needsNewTerminal: true });
    expect(t.userPath()).toBe(`C:\\Tools;%USERPROFILE%\\bin;${BIN}`);
    expect(t.files[CMD]).toContain("ELECTRON_RUN_AS_NODE=1");
  });
  it("installing twice changes nothing the second time", async () => {
    const t = fakeDeps("win32");
    const l = await createLauncher(t.deps);
    await l.install();
    const once = t.userPath();
    await l.install();
    expect(t.userPath()).toBe(once);
    expect(await l.inspect()).toMatchObject({ state: "installed", needsNewTerminal: false });
  });
  it("is broken, naming the missing file, when the PATH points at a folder without speakkit.cmd", async () => {
    const t = fakeDeps("win32", { userPath: BIN });
    expect(await (await createLauncher(t.deps)).inspect()).toMatchObject({ state: "broken", problem: `speakkit.cmd is missing in ${BIN}. Commands run but print nothing in a terminal.` });
  });
  it("is broken when the launcher points to an app that moved, and repair rewrites it", async () => {
    const t = fakeDeps("win32", { userPath: BIN, files: { [CMD]: shimText("win32", { execPath: "D:\\Old\\App.exe", script: "D:\\Old\\cli.js" }) } });
    const l = await createLauncher(t.deps);
    expect(await l.inspect()).toMatchObject({ state: "broken", problem: expect.stringContaining("moved") });
    expect(await l.install()).toMatchObject({ state: "installed" });
  });
  it("is broken when the file exists but the folder is not on the PATH", async () => {
    const t = fakeDeps("win32");
    await (await createLauncher(t.deps)).install();
    await t.deps.userPath.write("C:\\Tools");
    expect(await (await createLauncher(t.deps)).inspect()).toMatchObject({ state: "broken", onPath: false });
  });
  it("remove deletes our file and only our PATH entry", async () => {
    const t = fakeDeps("win32", { userPath: "C:\\Tools" });
    const l = await createLauncher(t.deps);
    await l.install();
    expect(await l.remove()).toMatchObject({ state: "not-installed", needsNewTerminal: true });
    expect(t.userPath()).toBe("C:\\Tools");
    expect(t.files[CMD]).toBeUndefined();
  });
  it("remove leaves a speakkit.cmd that someone else wrote", async () => {
    const t = fakeDeps("win32", { files: { [CMD]: "@echo mine" } });
    await (await createLauncher(t.deps)).remove();
    expect(t.files[CMD]).toBe("@echo mine");
  });
});

describe("macOS launcher", () => {
  const LOCAL = "/usr/local/bin/speakkit";
  const USER = "/Users/me/.local/bin/speakkit";
  it("is not installed on a clean machine", async () => {
    expect(await (await createLauncher(fakeDeps("darwin").deps)).inspect()).toMatchObject({ state: "not-installed" });
  });
  it("installs into /usr/local/bin when it can write there", async () => {
    const t = fakeDeps("darwin", { envPath: "/usr/local/bin:/usr/bin" });
    expect(await (await createLauncher(t.deps)).install()).toEqual({ state: "installed", dir: "/usr/local/bin", file: LOCAL, onPath: true, needsNewTerminal: true });
    expect(t.files[LOCAL]).toContain("ELECTRON_RUN_AS_NODE=1 exec");
  });
  it("falls back to ~/.local/bin and says it is not on the PATH", async () => {
    const t = fakeDeps("darwin", { writable: ["/Users/me/.local/bin"] });
    const r = await (await createLauncher(t.deps)).install();
    expect(r).toMatchObject({ state: "installed", dir: "/Users/me/.local/bin", file: USER, onPath: false });
  });
  it("reports an error when no folder can be written", async () => {
    await expect((await createLauncher(fakeDeps("darwin", { writable: [] }).deps)).install()).rejects.toThrow("no write access");
  });
  it("replaces its own launcher where it already is instead of making a second one", async () => {
    const t = fakeDeps("darwin", { files: { [USER]: shimText("darwin", { execPath: "/old", script: "/old.js" }) } });
    const l = await createLauncher(t.deps);
    expect(await l.inspect()).toMatchObject({ state: "broken", dir: "/Users/me/.local/bin" });
    expect(await l.install()).toMatchObject({ state: "installed", dir: "/Users/me/.local/bin" });
    expect(t.files[LOCAL]).toBeUndefined();
  });
  it("ignores a speakkit that is not ours, and remove never deletes it", async () => {
    const t = fakeDeps("darwin", { files: { [LOCAL]: "#!/bin/sh\necho other\n" } });
    const l = await createLauncher(t.deps);
    expect((await l.inspect()).state).toBe("not-installed");
    await l.remove();
    expect(t.files[LOCAL]).toBe("#!/bin/sh\necho other\n");
  });
  it("remove deletes our launcher from every place", async () => {
    const t = fakeDeps("darwin", { files: { [USER]: shimText("darwin", { execPath: "/x", script: "/y" }) } });
    expect(await (await createLauncher(t.deps)).remove()).toMatchObject({ state: "not-installed" });
    expect(t.files[USER]).toBeUndefined();
  });
});
