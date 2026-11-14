import type { CommandLineState } from "../../shared/control/info";
import { addEntry, hasEntry, removeEntry } from "./path-list";

export interface CommandLine {
  status(): Promise<CommandLineState>;
  /** Installs, or repairs an install that went stale. */
  install(): Promise<CommandLineState>;
  remove(): Promise<CommandLineState>;
}

/** The parts that touch the operating system, so the rules above them run in a test. */
export interface WindowsBoundary {
  /** The user PATH exactly as stored (variables not expanded), or undefined when the user has none. Rejects when the value could not be read, so a failure is never taken for an empty PATH. */
  readPath(): Promise<string | undefined>;
  /** Keeps the PATH as it was before the first change, so a bad edit can be put back by hand. Never overwrites a copy that is already there. */
  backupPath(value: string): Promise<void>;
  /** Stores it as an expandable string and tells running programs the environment changed. */
  writePath(value: string): Promise<void>;
  /** The folder the launcher was put on the PATH for, kept by the app between runs. */
  marker: { read(): Promise<string | undefined>; write(dir: string): Promise<void>; clear(): Promise<void> };
  exists(file: string): Promise<boolean>;
}

/** The folder that holds the launcher this app ships (speakkit.cmd next to the app), or undefined when running from source. */
export interface Shipped {
  dir: string | undefined;
}

const UNAVAILABLE: CommandLineState = { kind: "unavailable", reason: "The command-line tool is part of the installed app. A build run from source does not have it." };

/** Windows: the folder of the shipped speakkit.cmd goes on the user PATH. Only that entry is added or removed; the rest of the PATH is written back as it was. */
export function windowsCommandLine(shipped: Shipped, b: WindowsBoundary): CommandLine {
  const sep = ";";
  const status = async (): Promise<CommandLineState> => {
    if (!shipped.dir) return UNAVAILABLE;
    let path: string;
    try {
      path = (await b.readPath()) ?? "";
    } catch {
      return { kind: "needs-repair", why: "Your PATH could not be read." };
    }
    const marked = await b.marker.read();
    const here = hasEntry(path, shipped.dir, sep);
    if (marked === undefined && !here) return { kind: "not-installed" };
    if (marked !== undefined && marked.toLowerCase() !== shipped.dir.toLowerCase()) return { kind: "needs-repair", why: "Speak Kit was moved since the command-line tool was installed." };
    if (!here) return { kind: "needs-repair", why: "The folder is no longer on your PATH." };
    if (!(await b.exists(`${shipped.dir}\\speakkit.cmd`))) return { kind: "needs-repair", why: "The launcher file is missing." };
    return { kind: "installed", where: shipped.dir };
  };
  return {
    status,
    async install() {
      if (!shipped.dir) return UNAVAILABLE;
      const stored = await b.readPath();
      let path = stored ?? "";
      if (stored !== undefined) await b.backupPath(stored);
      const marked = await b.marker.read();
      if (marked !== undefined && marked.toLowerCase() !== shipped.dir.toLowerCase()) path = removeEntry(path, marked, sep);
      await b.writePath(addEntry(path, shipped.dir, sep));
      await b.marker.write(shipped.dir);
      return status();
    },
    async remove() {
      if (!shipped.dir) return UNAVAILABLE;
      const marked = await b.marker.read();
      const path = (await b.readPath()) ?? "";
      let next = removeEntry(path, shipped.dir, sep);
      if (marked !== undefined) next = removeEntry(next, marked, sep);
      if (next !== path) await b.writePath(next);
      await b.marker.clear();
      return status();
    },
  };
}

export interface MacBoundary {
  /** The folders on the PATH of a new terminal. */
  pathFolders(): string[];
  /** The text of a file, or undefined when it is not there. */
  read(file: string): Promise<string | undefined>;
  /** Writes an executable file; rejects when the folder cannot be written. */
  writeExecutable(file: string, text: string): Promise<void>;
  remove(file: string): Promise<void>;
}

/** The launcher the system folder holds, and the one the person's own folder holds when the first is not writable. */
export const MAC_SPOTS = (home: string) => ["/usr/local/bin", `${home}/.local/bin`];

const launcherText = (shim: string) => `#!/bin/sh\nexec "${shim}" "$@"\n`;
/** A launcher this app writes, whichever copy of the app it points at; a file of the person's own, or of another program, is not. */
const isLauncher = (text: string) => /^#!\/bin\/sh\nexec ".*\/speakkit" "\$@"\n?$/.test(text);

/**
 * macOS: a two-line launcher in /usr/local/bin, or in ~/.local/bin when the first cannot be written. The shipped script finds the app from its own location,
 * so the launcher runs it by full path instead of linking to it. Nothing edits the PATH: when the folder is not on it the page says so.
 */
export function macCommandLine(shipped: { shim: string | undefined; home: string }, b: MacBoundary): CommandLine {
  const spots = MAC_SPOTS(shipped.home).map((d) => `${d}/speakkit`);
  const status = async (): Promise<CommandLineState> => {
    if (!shipped.shim) return UNAVAILABLE;
    for (const file of spots) {
      const text = await b.read(file);
      if (text === undefined || !isLauncher(text)) continue;
      if (!text.includes(`"${shipped.shim}"`)) return { kind: "needs-repair", why: "The launcher points at a copy of Speak Kit that is not this one." };
      const folder = file.slice(0, -"/speakkit".length);
      return b.pathFolders().includes(folder) ? { kind: "installed", where: file } : { kind: "needs-path", where: file, folder };
    }
    return { kind: "not-installed" };
  };
  return {
    status,
    async install() {
      if (!shipped.shim) return UNAVAILABLE;
      for (const file of spots) {
        const there = await b.read(file);
        if (there !== undefined && !isLauncher(there)) continue; // somebody else's speakkit: left alone
        try {
          await b.writeExecutable(file, launcherText(shipped.shim));
          return await status();
        } catch {
          continue; // not writable: the next folder is the person's own
        }
      }
      return { kind: "needs-repair", why: "No folder for the launcher could be written." };
    },
    async remove() {
      for (const file of spots) {
        const text = await b.read(file);
        if (text !== undefined && shipped.shim && text.includes(`"${shipped.shim}"`)) await b.remove(file);
      }
      return status();
    },
  };
}
