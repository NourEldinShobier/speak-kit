import { exeKey } from "../paste-plan";
import { newId } from "../vocabulary/terms";
import type { Candidate } from "./learn";

/** Words the speech model got wrong and the words they should have been, with the context they were learned in. */
export interface Correction {
  id: string;
  /** The misheard words, as a phrase of one to three words. */
  heard: string;
  correct: string;
  /** The words next to the phrase when it was learned, lower case; they help find the same slip spelled a little differently. */
  left?: string | undefined;
  right?: string | undefined;
  /** Program name as `exeKey` gives it; the correction applies only there. Absent: everywhere. */
  app?: string | undefined;
  /** How many times the same fix was seen. */
  count: number;
  createdAt: number;
  /** The person saved it on purpose. A fix seen by itself only becomes active when it is seen again. */
  confirmed?: boolean | undefined;
  /** The dictations (history entry ids) this fix was seen in, newest last, so seeing one dictation twice counts once. */
  sources?: string[] | undefined;
}

export const MAX_CORRECTIONS = 500;
/** A fix that was not saved on purpose starts to apply when it was seen this many times. */
export const ACTIVE_COUNT = 2;
const MAX_SOURCES = 5;

export const isActive = (c: Correction): boolean => c.confirmed === true || c.count >= ACTIVE_COUNT;

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The corrections that apply in the program in front: active ones, for everywhere or for this program. */
export function usable(list: readonly Correction[], exe: string | undefined): Correction[] {
  const key = exe ? exeKey(exe) : undefined;
  return list.filter((c) => isActive(c) && (c.app === undefined || c.app === key));
}

/** A sighting counts when it is from a dictation not seen yet; a single word counts only next to a neighbour it had when it was first seen. */
function counts(twin: Correction, fix: Candidate, source: string | undefined): boolean {
  if (source && twin.sources?.includes(source)) return false;
  if (twin.heard.includes(" ")) return true;
  return (!!fix.left && fix.left === twin.left) || (!!fix.right && fix.right === twin.right);
}

/**
 * Adds a fix, or counts it again when the list has it already. A fix saved on purpose replaces another fix for the same words in the same place;
 * one that was only seen sits beside it and never removes a fix that applies. A fix counts once per dictation (`source`), and a single word counts
 * again only with the same neighbour. A full list drops the oldest fix that is not active, else the oldest.
 */
export function remember(list: readonly Correction[], fix: Candidate, opts: { now: number; app?: string; confirmed?: boolean; source?: string }): Correction[] {
  const app = opts.app ? exeKey(opts.app) : undefined;
  const heard = fix.heard.trim().replace(/\s+/g, " ");
  const correct = fix.correct.trim().replace(/\s+/g, " ");
  if (!heard || !correct || same(heard, correct)) return [...list];
  const twin = list.find((c) => same(c.heard, heard) && c.correct === correct && c.app === app);
  if (twin) {
    const more = counts(twin, fix, opts.source);
    const sources = more && opts.source ? { sources: [...(twin.sources ?? []), opts.source].slice(-MAX_SOURCES) } : {};
    return list.map((c) => (c === twin ? { ...c, count: c.count + (more ? 1 : 0), ...sources, ...(opts.confirmed && { confirmed: true }) } : c));
  }
  const rest = list.filter((c) => !(same(c.heard, heard) && c.app === app && (opts.confirmed || !isActive(c))));
  const next: Correction = {
    id: newId(),
    heard,
    correct,
    ...(fix.left && { left: fix.left }),
    ...(fix.right && { right: fix.right }),
    ...(app && { app }),
    count: 1,
    createdAt: opts.now,
    ...(opts.confirmed && { confirmed: true }),
    ...(opts.source && { sources: [opts.source] }),
  };
  if (rest.length < MAX_CORRECTIONS) return [...rest, next];
  const drop = rest.findIndex((c) => !isActive(c));
  return [...rest.filter((_, i) => i !== (drop < 0 ? 0 : drop)), next];
}

/** By id: deleting twice, or a row that is already gone, changes nothing. */
export const removeCorrection = (list: readonly Correction[], id: string): Correction[] => list.filter((c) => c.id !== id);

/** The listed fixes marked as saved on purpose, so they apply. */
export const confirmCorrections = (list: readonly Correction[], ids: readonly string[]): Correction[] => list.map((c) => (ids.includes(c.id) ? { ...c, confirmed: true } : c));
