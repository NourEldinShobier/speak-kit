import type { Row } from "./api";
import { RATE } from "./chunker";
import type { JobQueue } from "./queue";
import { daysLeft, type Policy } from "./retention";
import type { Entry } from "./types";

/** One row of the list: the manifest entry with its place in the waiting line, the days it has left and, for a search, the words around the match. */
export function toRow(e: Entry, o: { queue: JobQueue; spooled: ReadonlyMap<string, number>; now: number; policy: Policy; snippet: string | undefined }): Row {
  const q = o.queue.running === e.id ? 0 : o.queue.waiting.indexOf(e.id) + 1;
  return {
    id: e.id,
    title: e.title,
    createdAt: e.createdAt,
    durationSec: e.status === "recording" ? (o.spooled.get(e.id) ?? 0) / RATE : e.durationSec,
    source: e.source,
    ...(e.sourceName && { sourceName: e.sourceName }),
    language: e.language,
    status: e.status,
    chunksDone: e.chunksDone,
    chunksTotal: e.chunksTotal,
    ...(e.failure && { failure: e.failure }),
    ...(e.recovered && { recovered: true }),
    audioBytes: e.audioBytes,
    audioRemoved: e.audioRemovedAt !== undefined,
    daysLeft: daysLeft(e, o.now, o.policy),
    ...(q > 0 || o.queue.running === e.id ? { queued: q } : {}),
    ...(o.snippet && { snippet: o.snippet }),
  };
}
