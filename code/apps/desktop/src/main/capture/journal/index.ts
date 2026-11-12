/** File access the journal needs. `write` must replace the file atomically (write a temp file, then rename). */
export interface JournalFs {
  write(file: string, text: string): Promise<void>;
  read(file: string): Promise<string | undefined>;
  /** Names of the entries directly under `dir`. */
  list(dir: string): Promise<string[]>;
  /** Names of the files directly under `dir`. */
  fileNames(dir: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  /** Removes a folder and everything in it; no error when it is missing. */
  removeDir(dir: string): Promise<void>;
}

/** The stages of one capture, in order. Each is written before the work after it starts. */
export const STAGES = ["recording", "media-saved", "words-saved", "complete"] as const;
export type Stage = (typeof STAGES)[number];

export interface JournalEntry {
  id: string;
  stage: Stage;
  startedAt: number;
  /** File name of the video or picture inside the capture folder, once it is saved. */
  media?: string;
}

export interface RecoveryReport {
  /** Captures that were interrupted after their media was saved and were completed now. */
  finished: string[];
  /** Captures with nothing worth keeping; their folders were removed. */
  removed: string[];
  /** Captures that could not be finished or removed; they stay and are tried again at the next start. */
  failed: string[];
}

export interface Journal {
  begin(id: string, startedAt: number): Promise<void>;
  stage(id: string, stage: Stage, media?: string): Promise<void>;
  /** Looks at every capture folder that is not complete: finishes it when its media is saved or was streamed to disk before the crash, removes it when not. */
  recover(finish: (entry: JournalEntry) => Promise<void>): Promise<RecoveryReport>;
}

const FILE = "journal.json";
const at = (root: string, id: string, name = "") => `${root}/${id}${name ? `/${name}` : ""}`;

function parse(text: string | undefined): JournalEntry | undefined {
  if (!text) return undefined;
  try {
    const e = JSON.parse(text) as Partial<JournalEntry>;
    if (typeof e.id === "string" && STAGES.includes(e.stage as Stage) && typeof e.startedAt === "number") return e as JournalEntry;
  } catch {
    // an unreadable journal is treated as no journal: the folder is removed
  }
  return undefined;
}

/** Records every stage of a capture on disk so that a crash never leaves a half bundle: at the next start each interrupted capture is finished or removed. */
export function createJournal(fs: JournalFs, root: string): Journal {
  const write = (e: JournalEntry) => fs.write(at(root, e.id, FILE), JSON.stringify(e));
  return {
    begin: (id, startedAt) => write({ id, stage: "recording", startedAt }),
    async stage(id, stage, media) {
      const cur = parse(await fs.read(at(root, id, FILE))) ?? { id, stage, startedAt: 0 };
      await write({ ...cur, stage, ...(media !== undefined && { media }) });
    },
    async recover(finish) {
      const report: RecoveryReport = { finished: [], removed: [], failed: [] };
      for (const id of await fs.list(root)) {
        const entry = parse(await fs.read(at(root, id, FILE)));
        // A folder without a journal is not ours (or not started): leave it alone unless it has a journal that is unreadable.
        if (!entry) {
          if (await fs.exists(at(root, id, FILE))) report[(await discard(fs, at(root, id))) ? "removed" : "failed"].push(id);
          continue;
        }
        if (entry.stage === "complete") continue;
        const saved = entry.stage !== "recording" ? entry.media !== undefined && (await fs.exists(at(root, id, entry.media))) : await hasStreamed(fs, at(root, id));
        if (!saved) {
          report[(await discard(fs, at(root, id))) ? "removed" : "failed"].push(id);
          continue;
        }
        try {
          await finish(entry);
          await write({ ...entry, stage: "complete" });
          report.finished.push(id);
        } catch {
          report.failed.push(id);
        }
      }
      return report;
    },
  };
}

/** A capture cut off while recording has what was already streamed to disk: a video or at least one picture. */
async function hasStreamed(fs: JournalFs, dir: string): Promise<boolean> {
  return (await fs.exists(`${dir}/video.webm`)) || (await fs.fileNames(`${dir}/frames`)).length > 0;
}

/** Removes an interrupted capture folder; true when it is gone. */
async function discard(fs: JournalFs, dir: string): Promise<boolean> {
  try {
    await fs.removeDir(dir);
    return true;
  } catch {
    // reported as failed by the caller; the folder is tried again at the next start
    return false;
  }
}
