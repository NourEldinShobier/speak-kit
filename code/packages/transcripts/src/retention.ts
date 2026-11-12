import type { Entry } from "./types";

const DAY = 86_400_000;

/** How long things are kept. `null` is forever. The audio is never kept longer than the text. */
export interface Policy {
  textDays: number | null;
  audioDays: number | null;
  /** Total size of the kept audio; the oldest audio goes first when it is exceeded. */
  audioCapBytes: number | null;
  /** How long a deleted transcript waits in the Trash. */
  trashDays: number;
}

export const DEFAULT_POLICY: Policy = { textDays: 90, audioDays: 7, audioCapBytes: 5 * 1024 ** 3, trashDays: 30 };

/** Clamps a policy: day counts are whole and at least 1, the audio period is cut to the text period. */
export function normalizePolicy(p: Policy): Policy {
  const days = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.max(1, Math.round(n)));
  const textDays = days(p.textDays);
  let audioDays = days(p.audioDays);
  if (textDays !== null && (audioDays === null || audioDays > textDays)) audioDays = textDays;
  return { textDays, audioDays, audioCapBytes: p.audioCapBytes === null ? null : Math.max(0, p.audioCapBytes), trashDays: days(p.trashDays) ?? DEFAULT_POLICY.trashDays };
}

/** Work in progress is never swept: it would pull the audio from under the engine. */
const idle = (e: Entry) => e.status === "done" || e.status === "failed" || e.status === "cancelled" || e.status === "interrupted";

export interface Sweep {
  /** Past the text period: move to the Trash. */
  trash: string[];
  /** Past the Trash period: delete for good. */
  remove: string[];
  /** Past the audio period or over the size cap: delete the audio only. */
  dropAudio: string[];
}

/** What the retention settings say to do now. Pure: the caller does it. */
export function sweep(all: readonly Entry[], now: number, policy: Policy): Sweep {
  const p = normalizePolicy(policy);
  const out: Sweep = { trash: [], remove: [], dropAudio: [] };
  for (const e of all) {
    if (e.trashedAt !== undefined) {
      if (now - e.trashedAt >= p.trashDays * DAY) out.remove.push(e.id);
      continue;
    }
    if (!idle(e)) continue;
    if (p.textDays !== null && now - e.createdAt >= p.textDays * DAY) out.trash.push(e.id);
  }
  const live = all.filter((e) => e.audioBytes > 0 && idle(e) && !out.remove.includes(e.id)).sort((a, b) => a.createdAt - b.createdAt);
  let total = live.reduce((n, e) => n + e.audioBytes, 0);
  for (const e of live) {
    const old = p.audioDays !== null && now - e.createdAt >= p.audioDays * DAY;
    const over = p.audioCapBytes !== null && total > p.audioCapBytes;
    if (old || over) {
      out.dropAudio.push(e.id);
      total -= e.audioBytes;
    }
  }
  return out;
}

/** Whole days until the transcript moves to the Trash (or, in the Trash, is deleted); null when it stays. */
export function daysLeft(e: Entry, now: number, policy: Policy): number | null {
  const p = normalizePolicy(policy);
  const [from, days] = e.trashedAt !== undefined ? [e.trashedAt, p.trashDays] : [e.createdAt, p.textDays];
  if (days === null) return null;
  return Math.max(0, Math.ceil((from + days * DAY - now) / DAY));
}

/** Total size of the kept audio. */
export const audioTotal = (all: readonly Entry[]): number => all.reduce((n, e) => n + e.audioBytes, 0);
