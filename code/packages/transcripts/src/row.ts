import type { Row } from "./api";
import type { JobQueue } from "./queue";
import { daysLeft } from "./retention";
import type { Entry } from "./types";

/** One row of the list: the manifest entry with its place in the waiting line, the days it has left and, for a search, the words around the match. */
export function toRow(e: Entry, o: { queue: JobQueue; writing: ReadonlySet<string>; now: number; snippet: string | undefined }): Row {
  const q = o.queue.running === e.id ? 0 : o.queue.waiting.indexOf(e.id) + 1;
  return {
    id: e.id,
    title: e.title,
    createdAt: e.createdAt,
    durationSec: e.durationSec,
    ...(e.sourceName && { sourceName: e.sourceName }),
    language: e.language,
    status: e.status,
    chunksDone: e.chunksDone,
    chunksTotal: e.chunksTotal,
    ...(e.failure && { failure: e.failure }),
    audioBytes: e.audioBytes,
    audioRemoved: e.audioRemovedAt !== undefined,
    daysLeft: daysLeft(e, o.now),
    ...(q > 0 || o.queue.running === e.id ? { queued: q } : {}),
    ...(o.snippet && { snippet: o.snippet }),
    ...((o.writing.has(e.id) || e.notes) && { notesState: o.writing.has(e.id) ? ("writing" as const) : e.notes! }),
  };
}
