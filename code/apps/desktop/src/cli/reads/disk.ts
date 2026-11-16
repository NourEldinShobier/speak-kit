import { readFile } from "node:fs/promises";
import path from "node:path";
import { MeetingStore } from "@speakkit/meetings";
import { nodeFs, type Fs } from "@speakkit/transcripts";
import type { MeetingsSource } from "./meetings";

/** What the read commands look at. The command line and the MCP server both use the disk one; tests use a memory one. */
export interface Sources {
  meetings(): Promise<MeetingsSource>;
}

const refuse = (): never => {
  throw new Error("read-only");
};

/** A file system that reads and nothing else: a read command must create, change and delete no file, whatever the code behind it tries. */
const readOnly = (fs: Fs): Fs => ({ read: (f) => fs.read(f), exists: (f) => fs.exists(f), write: refuse, remove: refuse, rename: refuse, append: refuse });

const readText = async (file: string): Promise<string | undefined> => {
  try {
    return await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
};

/** The meetings in the app's data folder. Opening starts nothing and writes nothing; the app may be running or not. */
export function diskSources(dir: string): Sources {
  return {
    async meetings() {
      // The app sets a damaged manifest aside and starts a new one; a read must not, so it says the file is damaged instead of showing no meetings.
      const manifest = await readText(path.join(dir, "meetings", "manifest.json"));
      if (manifest !== undefined) {
        try {
          JSON.parse(manifest);
        } catch {
          throw new Error("the meetings list file is damaged");
        }
      }
      const store = await MeetingStore.open({ dir: path.join(dir, "meetings"), fs: readOnly(nodeFs()), now: Date.now });
      return { entries: store.list(), transcript: (id) => store.transcript(id), notes: (id) => store.notes(id) };
    },
  };
}
