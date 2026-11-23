import type { Entry } from "./types";

const DAY = 86_400_000;

/** How long a transcript is kept before it is deleted. */
export const TEXT_DAYS = 30;
/** How long the audio of a transcript that did not finish is kept for a retry. The audio of a finished one is deleted at once. */
export const AUDIO_DAYS = 7;
/** Most audio kept in total; above it the oldest audio is deleted first. */
export const AUDIO_CAP_BYTES = 5 * 1024 ** 3;

/** Work in progress is never swept: it would pull the audio from under the engine. */
const idle = (e: Entry) => e.status === "done" || e.status === "failed" || e.status === "cancelled" || e.status === "interrupted";

export interface Sweep {
  /** Past the text period, or left in the Trash of an earlier version: delete for good. */
  remove: string[];
  /** Past the audio period or over the size cap: delete the audio only. */
  dropAudio: string[];
}

/** What the retention rules say to do now. Pure: the caller does it. */
export function sweep(all: readonly Entry[], now: number): Sweep {
  const out: Sweep = { remove: [], dropAudio: [] };
  for (const e of all) if (e.trashedAt !== undefined || (idle(e) && now - e.createdAt >= TEXT_DAYS * DAY)) out.remove.push(e.id);
  const live = all.filter((e) => e.audioBytes > 0 && idle(e) && !out.remove.includes(e.id)).sort((a, b) => a.createdAt - b.createdAt);
  let total = live.reduce((n, e) => n + e.audioBytes, 0);
  for (const e of live) {
    const spent = e.status === "done" || now - e.createdAt >= AUDIO_DAYS * DAY;
    if (spent || total > AUDIO_CAP_BYTES) {
      out.dropAudio.push(e.id);
      total -= e.audioBytes;
    }
  }
  return out;
}

/** Whole days until the transcript is deleted. */
export const daysLeft = (e: Entry, now: number): number => Math.max(0, Math.ceil((e.createdAt + TEXT_DAYS * DAY - now) / DAY));

/** Total size of the kept audio. */
export const audioTotal = (all: readonly Entry[]): number => all.reduce((n, e) => n + e.audioBytes, 0);
