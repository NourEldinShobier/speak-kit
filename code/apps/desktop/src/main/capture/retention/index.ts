import type { CaptureStore } from "../store";

export interface RetentionPorts {
  store: Pick<CaptureStore, "list" | "remove">;
  /** Moves a folder to the Recycle Bin (Trash on macOS). Resolves false or throws when that is not possible. */
  trash(dir: string): Promise<boolean>;
  /** Deletes a folder for good. */
  removeDir(dir: string): Promise<void>;
  /** Absolute path of a capture folder. */
  resolve(dir: string): string;
  log(line: string): void;
  now(): number;
}

export interface SweepResult {
  removed: number;
  /** Went to the Recycle Bin. */
  trashed: number;
  /** Had to be deleted for good because the Recycle Bin was not available; each has a log line. */
  deleted: number;
  /** Could not be removed; kept in the list. */
  failed: number;
}

const DAY = 86_400_000;

/**
 * Removes captures older than `days` (0 keeps everything). Each folder goes to the Recycle Bin; when that is not possible it is deleted with a log
 * line. Only captures whose folder is gone leave the list, and they leave through the store's own removal, which works on the current list, so a
 * capture saved while the sweep ran is never lost.
 */
export async function sweepCaptures(days: number, p: RetentionPorts): Promise<SweepResult> {
  const result: SweepResult = { removed: 0, trashed: 0, deleted: 0, failed: 0 };
  if (!(days > 0)) return result;
  const cutoff = p.now() - days * DAY;
  const old = (await p.store.list()).filter((r) => r.at < cutoff && !r.finishing);
  const gone: string[] = [];
  for (const r of old) {
    const dir = p.resolve(r.dir);
    try {
      if (await p.trash(dir).catch(() => false)) result.trashed++;
      else {
        p.log(`capture ${r.id}: Recycle Bin not available, deleted for good`);
        await p.removeDir(dir);
        result.deleted++;
      }
      gone.push(r.id);
    } catch (e) {
      p.log(`capture ${r.id}: could not be removed (${e instanceof Error ? e.message : String(e)})`);
      result.failed++;
    }
  }
  if (gone.length) result.removed = (await p.store.remove(gone)).length;
  return result;
}
