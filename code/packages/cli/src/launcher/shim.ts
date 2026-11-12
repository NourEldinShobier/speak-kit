import path from "node:path";

/** Marks a file as ours, so removing never deletes someone else's `speakkit`. */
const MARK = "speakkit launcher";

const quoteSh = (s: string) => `"${s.replace(/["\\$`]/g, "\\$&")}"`;

export const shimPath = (platform: "win32" | "darwin", dir: string) => (platform === "win32" ? path.win32.join(dir, "speakkit.cmd") : path.posix.join(dir, "speakkit"));
export const isOurShim = (text: string) => text.includes(MARK);

/**
 * The launcher: runs the app's own executable as plain Node on cli.js. A GUI executable prints nothing in a terminal, but as Node
 * (ELECTRON_RUN_AS_NODE) it writes to the window it was started from and returns its exit code.
 */
export function shimText(platform: "win32" | "darwin", o: { execPath: string; script: string }): string {
  if (platform === "darwin") return `#!/bin/sh\n# ${MARK}\nELECTRON_RUN_AS_NODE=1 exec ${quoteSh(o.execPath)} ${quoteSh(o.script)} "$@"\n`;
  const q = (s: string) => `"${s.replace(/%/g, "%%")}"`;
  return `@echo off\r\nrem ${MARK}\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n${q(o.execPath)} ${q(o.script)} %*\r\nexit /b %ERRORLEVEL%\r\n`;
}

/** A command that opens a terminal window and runs `command` in it, for "Test in terminal". On Windows `dir` is where the window starts, so a launcher there is found without quoting its path. */
export function terminalCommand(platform: "win32" | "darwin", command: string, dir?: string): { file: string; args: string[] } {
  if (platform === "win32") return { file: "cmd.exe", args: ["/c", "start", "Speak Kit", ...(dir ? ["/D", dir] : []), "cmd", "/k", command] };
  const script = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return { file: "osascript", args: ["-e", `tell application "Terminal" to do script "${script}"`, "-e", 'tell application "Terminal" to activate'] };
}
