import type { MeetingEntry } from "./store";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** How long meetings are kept. Meeting audio is short-lived by default: it is the largest and most private part. */
export interface Retention {
  /** Hours the audio is kept after the meeting ends. 0 removes it as soon as the transcript is done. */
  audioHours: number;
  /** Days the transcript stays before it moves to the Trash. 0 keeps it. */
  textDays: number;
  /** Days a meeting waits in the Trash. */
  trashDays: number;
}

export const DEFAULT_RETENTION: Retention = { audioHours: 24, textDays: 30, trashDays: 30 };

const whole = (x: unknown, min: number, max: number): number | undefined => (typeof x === "number" && Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : undefined);

/**
 * A retention read from settings. A value that is not a sensible number falls back to the default and is named in `invalid`, so the caller can keep the
 * bad file as it was (it is never silently replaced) and tell the person.
 */
export function readRetention(raw: unknown): { value: Retention; invalid: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const invalid: string[] = [];
  const pick = (key: keyof Retention, min: number, max: number): number => {
    const v = whole(r[key], min, max);
    if (v === undefined && r[key] !== undefined && r[key] !== null) invalid.push(key);
    return v ?? DEFAULT_RETENTION[key];
  };
  return { value: { audioHours: pick("audioHours", 0, 24 * 365), textDays: pick("textDays", 0, 3650), trashDays: pick("trashDays", 1, 3650) }, invalid };
}

/** Meetings still being made are never swept: it would pull the audio from under the recorder or the engine. */
const idle = (e: MeetingEntry) => e.status === "done" || e.status === "failed" || e.status === "interrupted";

/** When this meeting's audio is deleted; undefined when it is already gone, has none, or the meeting is still running. */
export function audioDeadline(e: MeetingEntry, r: Retention): number | undefined {
  if (e.audioRemovedAt !== undefined || e.audio.you + e.audio.them === 0 || e.endedAt === undefined || !idle(e)) return undefined;
  return e.endedAt + r.audioHours * HOUR;
}

/** When the transcript moves to the Trash, or is deleted for good when it is in the Trash. */
export function textDeadline(e: MeetingEntry, r: Retention): number | undefined {
  if (e.trashedAt !== undefined) return e.trashedAt + r.trashDays * DAY;
  if (r.textDays === 0 || !idle(e)) return undefined;
  return (e.endedAt ?? e.startedAt) + r.textDays * DAY;
}

/** The line each row shows: "Audio removed in 23 h", "Audio removed in 12 min", "Audio removed". Nothing for a meeting that has no audio to remove. */
export function audioLabel(e: MeetingEntry, now: number, r: Retention): string | undefined {
  if (e.audioRemovedAt !== undefined) return "Audio removed";
  const at = audioDeadline(e, r);
  if (at === undefined) return undefined;
  const left = at - now;
  if (left <= 0) return "Audio removed";
  const mins = Math.ceil(left / 60_000);
  if (mins < 60) return `Audio removed in ${mins} min`;
  if (left < 48 * HOUR) return `Audio removed in ${Math.ceil(left / HOUR)} h`;
  return `Audio removed in ${Math.ceil(left / DAY)} days`;
}

export interface Sweep {
  dropAudio: string[];
  trash: string[];
  remove: string[];
}

/** What the retention says to do now. Pure: the caller does it, under the store's lock. */
export function sweep(entries: readonly MeetingEntry[], now: number, r: Retention): Sweep {
  const out: Sweep = { dropAudio: [], trash: [], remove: [] };
  for (const e of entries) {
    const text = textDeadline(e, r);
    if (e.trashedAt !== undefined) {
      if (text !== undefined && now >= text) out.remove.push(e.id);
      continue;
    }
    if (text !== undefined && now >= text) out.trash.push(e.id);
    const audio = audioDeadline(e, r);
    // A failed meeting keeps its audio until the person deletes it or the deadline passes: it is what a retry works from.
    if (audio !== undefined && now >= audio) out.dropAudio.push(e.id);
  }
  return out;
}
