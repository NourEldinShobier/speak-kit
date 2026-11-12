import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { macCommandLine, windowsCommandLine, type CommandLine, type MacBoundary, type WindowsBoundary } from "./index";

const run = promisify(execFile);
const KEY = "HKCU\\Environment";

/** The value of `Path` from the text `reg query` prints: "    Path    REG_EXPAND_SZ    C:\a;%USERPROFILE%\b". */
export function parseRegQuery(text: string): string | undefined {
  const m = /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im.exec(text);
  return m ? m[1]!.trimEnd() : undefined;
}

const text = async (file: string): Promise<string | undefined> => {
  try {
    return await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
};

/** Sets and clears a throwaway variable: the system tells every running program the environment changed, so a new terminal sees the PATH at once. */
const broadcast = () => run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", '[Environment]::SetEnvironmentVariable("SPEAKKIT_REFRESH","1","User"); [Environment]::SetEnvironmentVariable("SPEAKKIT_REFRESH",$null,"User")']);

function windowsBoundary(markerFile: string): WindowsBoundary {
  return {
    async readPath() {
      try {
        return parseRegQuery((await run("reg.exe", ["query", KEY, "/v", "Path"])).stdout);
      } catch {
        return undefined; // the user has no Path value yet
      }
    },
    async writePath(value) {
      await run("reg.exe", ["add", KEY, "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", value, "/f"]);
      await broadcast();
    },
    marker: {
      read: async () => (await text(markerFile))?.trim() || undefined,
      write: async (dir) => void (await mkdir(path.dirname(markerFile), { recursive: true }), await writeFile(markerFile, dir)),
      clear: () => rm(markerFile, { force: true }),
    },
    exists: async (file) => {
      try {
        return (await stat(file)).isFile();
      } catch {
        return false;
      }
    },
  };
}

const macBoundary = (): MacBoundary => ({
  pathFolders: () => (process.env.PATH ?? "").split(":"),
  read: text,
  async writeExecutable(file, body) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await chmod(file, 0o755);
  },
  remove: (file) => rm(file, { force: true }),
});

export interface RealOptions {
  platform: NodeJS.Platform;
  /** The folder of the shipped launcher: `<resources>/bin`, or undefined in a build run from source. */
  shippedDir: string | undefined;
  userData: string;
  home: string;
}

/** The command-line tool of the system this app runs on; Linux is not supported and reports it as not available. */
export function realCommandLine(o: RealOptions): CommandLine {
  if (o.platform === "win32") return windowsCommandLine({ dir: o.shippedDir }, windowsBoundary(path.join(o.userData, "cli-path.txt")));
  if (o.platform === "darwin") return macCommandLine({ shim: o.shippedDir && `${o.shippedDir}/speakkit`, home: o.home }, macBoundary());
  const none = async () => ({ kind: "unavailable", reason: "The command-line tool is available on Windows and macOS." }) as const;
  return { status: none, install: none, remove: none };
}
