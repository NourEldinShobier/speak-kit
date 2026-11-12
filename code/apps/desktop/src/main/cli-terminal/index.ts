import { spawn } from "node:child_process";
import { TRY_COMMAND, type CommandLineState } from "../../shared/control/info";
import { shellQuote } from "../cli-path/manual";

/** Opens a terminal window that runs one command. */
export interface Terminal {
  /** `extraPath` is a folder put in front of that window's PATH, so the command works before a new terminal has seen the PATH change. */
  open(command: string, extraPath?: string): Promise<void>;
}

export interface Launch {
  file: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/** The program and arguments that open a terminal running `command` on this system, or undefined where there is none (Linux is not supported). */
export function terminalLaunch(o: { platform: NodeJS.Platform; command: string; extraPath: string | undefined; env: NodeJS.ProcessEnv }): Launch | undefined {
  const { platform, command, extraPath, env } = o;
  if (platform === "win32") {
    const key = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "Path";
    const withPath = extraPath ? { ...env, [key]: `${extraPath};${env[key] ?? ""}` } : env;
    // `start` gives the command its own window; /k keeps it open after the output so it can be read.
    return { file: "cmd.exe", args: ["/d", "/c", "start", "Speak Kit", "cmd.exe", "/k", ...command.split(" ")], env: withPath };
  }
  if (platform === "darwin") {
    const quote = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const line = `${extraPath ? `export PATH=${shellQuote(extraPath)}:"$PATH"; ` : ""}${command}`;
    return { file: "osascript", args: ["-e", `tell application "Terminal" to do script "${quote(line)}"`, "-e", 'tell application "Terminal" to activate'], env };
  }
  return undefined;
}

/** Runs the try-it command in a terminal. Only an installed launcher can be tried; the window gets the launcher's folder on its PATH so it works before a new terminal exists. */
export async function openTryCommand(line: CommandLineState, terminal: Terminal, shippedDir: string | undefined): Promise<void> {
  if (line.kind !== "installed" && line.kind !== "needs-path") throw new Error("The command-line tool is not installed.");
  await terminal.open(TRY_COMMAND, shippedDir);
}

/** The terminal of the system this app runs on. Rejects when it cannot be opened. */
export function systemTerminal(platform: NodeJS.Platform): Terminal {
  return {
    open(command, extraPath) {
      const launch = terminalLaunch({ platform, command, extraPath, env: process.env });
      if (!launch) return Promise.reject(new Error("A terminal can be opened on Windows and macOS."));
      return new Promise((resolve, reject) => {
        const child = spawn(launch.file, launch.args, { env: launch.env, detached: true, stdio: "ignore" });
        child.once("error", reject);
        child.once("spawn", () => (child.unref(), resolve()));
      });
    },
  };
}
