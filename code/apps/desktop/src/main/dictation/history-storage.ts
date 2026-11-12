import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HistoryStorage } from "@speakkit/dictation";

/**
 * One JSON file, written whole through a temporary file so a crash never leaves half a history. A missing file is an empty history. A file that does not
 * parse, or that a newer version of the app wrote, is copied next to itself first (`preserve`) so nothing the person had is lost.
 */
export function createHistoryStorage(file: string, now: () => number = Date.now): HistoryStorage {
  return {
    async load() {
      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch {
        return [];
      }
      try {
        return JSON.parse(text);
      } catch {
        await this.preserve?.("unreadable");
        return [];
      }
    },
    async save(value) {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(value));
      await rename(tmp, file);
    },
    async preserve(reason) {
      const ext = path.extname(file);
      const copy = `${file.slice(0, file.length - ext.length)}.${reason}-${now()}${ext}`;
      try {
        await copyFile(file, copy);
      } catch {
        // Nothing to keep when the file is already gone.
      }
    },
  };
}
