import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HistoryStorage } from "@speakkit/dictation";

/**
 * One JSON file, written whole through a temporary file so a crash never leaves half a history. A missing file is an empty history. A file that does not
 * parse throws on load; that one and a file a newer version of the app wrote are copied next to themselves (`preserve`) so nothing the person had is lost.
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
      return JSON.parse(text); // a file that is not JSON throws; the history reports it as unreadable and keeps a copy
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
        return path.basename(copy);
      } catch {
        return undefined; // nothing to keep when the file is already gone
      }
    },
  };
}
