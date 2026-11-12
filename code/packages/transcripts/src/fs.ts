import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** The file system as the store sees it. `write` is atomic: the old file stays whole until the new one is complete. */
export interface Fs {
  read(file: string): Promise<Uint8Array | undefined>;
  write(file: string, data: Uint8Array | string): Promise<void>;
  /** Not an error when the file is already gone. */
  remove(file: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Adds to the end of the file, creating it; not atomic (a recording spool). */
  append(file: string, data: Uint8Array): Promise<void>;
  exists(file: string): Promise<boolean>;
}

export class DiskFullError extends Error {
  constructor() {
    super("The disk is full.");
  }
}

const code = (e: unknown) => (e as { code?: string }).code;

/** Node's file system with write-to-temp-then-rename; a full disk becomes `DiskFullError`. */
export function nodeFs(): Fs {
  return {
    async read(file) {
      try {
        return await readFile(file);
      } catch (e) {
        if (code(e) === "ENOENT") return undefined;
        throw e;
      }
    },
    async write(file, data) {
      const tmp = `${file}.${process.pid}.tmp`;
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(tmp, data);
        await rename(tmp, file);
      } catch (e) {
        await rm(tmp, { force: true }).catch(() => {});
        if (code(e) === "ENOSPC" || code(e) === "EDQUOT") throw new DiskFullError();
        throw e;
      }
    },
    remove: (file) => rm(file, { force: true }),
    async rename(from, to) {
      await mkdir(path.dirname(to), { recursive: true });
      await rename(from, to);
    },
    async append(file, data) {
      await mkdir(path.dirname(file), { recursive: true });
      try {
        await appendFile(file, data);
      } catch (e) {
        if (code(e) === "ENOSPC" || code(e) === "EDQUOT") throw new DiskFullError();
        throw e;
      }
    },
    exists: (file) =>
      stat(file).then(
        () => true,
        () => false,
      ),
  };
}
