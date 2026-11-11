import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HistoryStorage } from "@speakkit/dictation";

/** One JSON file, written whole through a temporary file so a crash never leaves half a history. A file that is missing or unreadable is an empty history. */
export function createHistoryStorage(file: string): HistoryStorage {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(file, "utf8"));
      } catch {
        return [];
      }
    },
    async save(value) {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(value));
      await rename(tmp, file);
    },
  };
}
