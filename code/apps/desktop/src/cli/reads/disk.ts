import { readFile } from "node:fs/promises";
import path from "node:path";
import { MeetingStore } from "@speakkit/meetings";
import { nodeFs, type Fs } from "@speakkit/transcripts";
import { createStore, type StoreFs } from "../../main/capture/store";
import type { CaptureRecord } from "./captures";
import type { MeetingsSource } from "./meetings";

/** What the read commands look at. The command line and the MCP server both use the disk one; tests use a memory one. */
export interface Sources {
  meetings(): Promise<MeetingsSource>;
  captures(): Promise<{ records: CaptureRecord[]; root: string }>;
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

/** The settings file, or nothing when it is missing or damaged. */
async function readConfig(dir: string): Promise<{ capture?: { folder?: unknown } } | undefined> {
  try {
    const text = await readText(path.join(dir, "config.json"));
    return text ? (JSON.parse(text) as { capture?: { folder?: unknown } }) : undefined;
  } catch {
    return undefined; // a damaged settings file means the default folder, and is left as it is
  }
}

const captureFs: StoreFs = { read: readText, write: refuse };

/** The meetings and captures in the app's data folder. Opening starts nothing and writes nothing; the app may be running or not. */
export function diskSources(dir: string): Sources {
  return {
    async meetings() {
      const store = await MeetingStore.open({ dir: path.join(dir, "meetings"), fs: readOnly(nodeFs()), now: Date.now });
      return { entries: store.list(), transcript: (id) => store.transcript(id), notes: (id) => store.notes(id) };
    },
    async captures() {
      const config = await readConfig(dir);
      const set = config?.capture?.folder;
      const root = typeof set === "string" && set ? set : path.join(dir, "captures");
      return { records: await createStore(captureFs, path.join(root, "index.json")).list(), root };
    },
  };
}
