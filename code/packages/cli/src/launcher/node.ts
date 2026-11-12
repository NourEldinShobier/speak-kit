import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { orNull } from "../or-null";
import type { LauncherDeps } from "./index";

const run = promisify(execFile);

const readOrNull = (file: string) =>
  readFile(file, "utf8").then(
    (t) => t,
    () => null,
  );

/** The user's own Path value, unexpanded, as new terminals get it. */
async function readUserPath(): Promise<string> {
  try {
    const { stdout } = await run("reg", ["query", "HKCU\\Environment", "/v", "Path"], { windowsHide: true });
    return /\bPath\s+REG_(?:EXPAND_)?SZ\s+(.*)\r?$/m.exec(stdout)?.[1]?.trim() ?? "";
  } catch {
    return ""; // no Path value yet
  }
}

/** Writes it as an expandable string (keeping %VARS% working) and tells running programs the environment changed, so new terminals see it. */
async function writeUserPath(value: string): Promise<void> {
  await run("reg", ["add", "HKCU\\Environment", "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", value, "/f"], { windowsHide: true });
  // Setting a user variable broadcasts the change; clearing a throwaway one costs nothing.
  await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::SetEnvironmentVariable('SPEAKKIT_BROADCAST','1','User'); [Environment]::SetEnvironmentVariable('SPEAKKIT_BROADCAST',$null,'User')"],
    { windowsHide: true },
  );
}

/** The real file system and registry for the launcher. */
export function nodeLauncherDeps(o: Pick<LauncherDeps, "platform" | "execPath" | "script" | "home" | "dataDir" | "envPath" | "macDirs"> & { userPathFile?: string }): LauncherDeps {
  const { userPathFile, ...rest } = o;
  return {
    ...rest,
    fs: {
      read: readOrNull,
      write: async (file, text, mode) => {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, text, { mode });
        await orNull(chmod(file, mode)); // best effort: a file system without modes still has the file
      },
      remove: (file) => rm(file, { force: true }),
      canWrite: async (dir) => {
        try {
          await mkdir(dir, { recursive: true });
          await access(dir, constants.W_OK);
          return true;
        } catch {
          return false;
        }
      },
    },
    // userPathFile stands in for the registry, so tests never change the real PATH of the person running them.
    userPath: userPathFile ? { read: async () => (await readOrNull(userPathFile)) ?? "", write: (value) => writeFile(userPathFile, value) } : { read: readUserPath, write: writeUserPath },
  };
}
