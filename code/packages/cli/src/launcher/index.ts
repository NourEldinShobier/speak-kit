import path from "node:path";
import { addDir, hasDir, removeDir } from "./path-list";
import { isOurShim, shimPath, shimText } from "./shim";

export { terminalCommand } from "./shim";

export interface CliInstall {
  /** installed: the launcher is there and current. broken: something points to a launcher that is missing or stale. */
  state: "not-installed" | "installed" | "broken";
  /** Folder of the launcher and the launcher file. */
  dir: string;
  file: string;
  /** The folder is on the PATH that new terminals get. */
  onPath: boolean;
  problem?: string;
  /** True right after a change: terminals that are already open keep the old PATH. */
  needsNewTerminal: boolean;
}

export interface Launcher {
  inspect(): Promise<CliInstall>;
  /** Writes the launcher and puts its folder on the PATH (Windows). Also repairs a broken one. */
  install(): Promise<CliInstall>;
  remove(): Promise<CliInstall>;
}

/** The OS pieces the launcher needs; the real ones are in node.ts, tests pass fakes. */
export interface LauncherDeps {
  platform: "win32" | "darwin";
  /** The app executable and the cli.js next to the app's main file. */
  execPath: string;
  script: string;
  home: string;
  /** Windows: the app's data folder (the launcher goes in its bin folder). */
  dataDir: string;
  /** PATH of this process, for macOS. */
  envPath: string;
  /** macOS: the folders the launcher may live in, in order. Default /usr/local/bin, then ~/.local/bin. */
  macDirs?: string[];
  fs: {
    read(file: string): Promise<string | null>;
    write(file: string, text: string, mode: number): Promise<void>;
    remove(file: string): Promise<void>;
    /** Can a file be created in this folder (creating the folder if its parent is writable)? */
    canWrite(dir: string): Promise<boolean>;
  };
  /** Windows: the user's Path value as new terminals get it. */
  userPath: { read(): Promise<string>; write(value: string): Promise<void> };
}

/** Where a macOS launcher may live, in order. /usr/local/bin is on every default PATH but often needs admin rights. */
const macDirs = (home: string) => ["/usr/local/bin", path.posix.join(home, ".local", "bin")];

async function windows(d: LauncherDeps): Promise<Launcher> {
  const dir = path.win32.join(d.dataDir, "bin");
  const file = shimPath("win32", dir);
  const want = shimText("win32", d);
  const look = async (changed: boolean): Promise<CliInstall> => {
    const [text, list] = await Promise.all([d.fs.read(file), d.userPath.read()]);
    const onPath = hasDir(list, dir, true);
    const base = { dir, file, onPath, needsNewTerminal: changed };
    if (text === null) return onPath ? { ...base, state: "broken", problem: `speakkit.cmd is missing in ${dir}. Commands run but print nothing in a terminal.` } : { ...base, state: "not-installed" };
    if (text !== want) return { ...base, state: "broken", problem: "speakkit.cmd points to a Speak Kit that has moved or been replaced." };
    return onPath ? { ...base, state: "installed" } : { ...base, state: "broken", problem: `${dir} is not on your PATH.` };
  };
  return {
    inspect: () => look(false),
    install: async () => {
      await d.fs.write(file, want, 0o644);
      const list = await d.userPath.read();
      const next = addDir(list, dir, true);
      if (next !== list) await d.userPath.write(next);
      return look(true);
    },
    remove: async () => {
      const text = await d.fs.read(file);
      if (text !== null && isOurShim(text)) await d.fs.remove(file);
      const list = await d.userPath.read();
      const next = removeDir(list, dir, true);
      if (next !== list) await d.userPath.write(next);
      return look(true);
    },
  };
}

async function mac(d: LauncherDeps): Promise<Launcher> {
  const dirs = d.macDirs ?? macDirs(d.home);
  const want = shimText("darwin", d);
  const look = async (changed: boolean): Promise<CliInstall> => {
    for (const dir of dirs) {
      const file = shimPath("darwin", dir);
      const text = await d.fs.read(file);
      if (text === null || !isOurShim(text)) continue;
      const onPath = hasDir(d.envPath, dir, false);
      const base = { dir, file, onPath, needsNewTerminal: changed };
      return text === want ? { ...base, state: "installed" } : { ...base, state: "broken", problem: "speakkit points to a Speak Kit that has moved or been replaced." };
    }
    return { state: "not-installed", dir: dirs[0]!, file: shimPath("darwin", dirs[0]!), onPath: false, needsNewTerminal: false };
  };
  return {
    inspect: () => look(false),
    install: async () => {
      // Replace a launcher that is already in one of the folders before trying a new place.
      const current = await look(false);
      const dir = current.state === "not-installed" ? await firstWritable(d, dirs) : current.dir;
      await d.fs.write(shimPath("darwin", dir), want, 0o755);
      return look(true);
    },
    remove: async () => {
      for (const dir of dirs) {
        const file = shimPath("darwin", dir);
        const text = await d.fs.read(file);
        if (text !== null && isOurShim(text)) await d.fs.remove(file);
      }
      return look(true);
    },
  };
}

async function firstWritable(d: LauncherDeps, dirs: string[]): Promise<string> {
  for (const dir of dirs) if (await d.fs.canWrite(dir)) return dir;
  throw new Error(`speakkit could not be put in ${dirs.join(" or ")}: no write access.`);
}

/** The launcher of this OS: Windows (a .cmd in the app's bin folder and the user PATH) or macOS (a script in a PATH folder). */
export const createLauncher = (d: LauncherDeps): Promise<Launcher> => (d.platform === "win32" ? windows(d) : mac(d));
