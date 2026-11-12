import { mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { JournalFs } from "./journal";
import type { StoreFs } from "./store";

/** Writes a file so that a crash or power loss leaves the old content or the new, never half or empty: a temp file in the same folder, flushed to disk, then a rename. */
async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fh = await open(tmp, "w");
  try {
    await fh.writeFile(text);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, file);
}

/** The text of a file, or undefined when there is none. Any other failure (no rights, a locked file) is thrown: it must not read as "empty". */
async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

export const storeFs: StoreFs = {
  read: readText,
  write: writeAtomic,
  moveAside: (file) => rename(file, `${file}.damaged-${Date.now()}`),
};

export const journalFs: JournalFs = {
  write: writeAtomic,
  read: readText,
  async list(dir) {
    try {
      return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      // no captures folder yet
      return [];
    }
  },
  async fileNames(dir) {
    try {
      return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
    } catch {
      // no such folder
      return [];
    }
  },
  async exists(p) {
    try {
      await stat(p);
      return true;
    } catch {
      // not there
      return false;
    }
  },
  removeDir: (dir) => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
};
