import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JournalFs } from "./journal";
import type { StoreFs } from "./store";

/** Writes a file so that a crash leaves the old content or the new, never half: a temp file in the same folder, then a rename. */
async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, file);
}

async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch {
    // a missing file is an empty answer
    return undefined;
  }
}

export const storeFs: StoreFs = { read: readText, write: writeAtomic };

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
