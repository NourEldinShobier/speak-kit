import { exeKey } from "../paste-plan";
import { isActive, MAX_SOUNDS, MAX_TERMS, newId, release, sameText, type Learned, type Term } from "../vocabulary/terms";
import type { Candidate } from "./learn";

const MAX_SOURCES = 5;

const squash = (s: string): string => s.trim().replace(/\s+/g, " ");

/** A sighting counts when it is from a dictation not seen yet; a single word counts only next to a neighbour it had when it was first seen. */
function counts(seen: Learned, fix: Candidate, source: string | undefined): boolean {
  if (source && seen.sources?.includes(source)) return false;
  if (seen.heard.includes(" ")) return true;
  return (!!fix.left && fix.left === seen.left) || (!!fix.right && fix.right === seen.right);
}

/** The entry without its suggestion mark: it is a saved entry now. */
function saved(t: Term): Term {
  const next = { ...t };
  delete next.suggested;
  return next;
}

/** The saved entry that already writes this word for this program. */
const ownerOf = (list: readonly Term[], word: string, app: string | undefined): Term | undefined => list.find((t) => !t.suggested && t.app === app && sameText(t.word, word));

/** A saved entry with one more heard-as spelling; the spelling is taken from any other saved entry of the same program. */
function extend(list: readonly Term[], own: Term, learned: Learned): Term[] {
  if (own.soundsLike.some((s) => sameText(s, learned.heard)) || own.soundsLike.length >= MAX_SOUNDS) return [...list];
  const next: Term = { ...own, soundsLike: [...own.soundsLike, learned.heard], learned: own.learned ?? learned };
  return release(list, [learned.heard], own.id, own.app).list.map((t) => (t.id === own.id ? next : t));
}

/** A full list gives up its oldest suggestion for a new entry; with none to give up, the entry is not added. */
function room(list: readonly Term[]): Term[] | undefined {
  if (list.length < MAX_TERMS) return [...list];
  const drop = list.findIndex((t) => t.suggested);
  return drop < 0 ? undefined : list.filter((_, i) => i !== drop);
}

function seenAgain(t: Term, fix: Candidate, opts: { source?: string | undefined; confirmed?: boolean | undefined }): Term {
  const seen = t.learned as Learned;
  const more = counts(seen, fix, opts.source);
  const sources = more && opts.source ? { sources: [...(seen.sources ?? []), opts.source].slice(-MAX_SOURCES) } : {};
  const next = { ...t, learned: { ...seen, count: seen.count + (more ? 1 : 0), ...sources } };
  return opts.confirmed ? saved(next) : next;
}

/**
 * Keeps a fix the person made: as a suggestion, or, when they saved it on purpose (`confirmed`), as a saved entry that writes the right words and hears the
 * misheard ones, added to the entry for those words when there is one. A suggestion is counted again when the same fix is seen: once per dictation (`source`),
 * and a single word again only with the same neighbour. Saving on purpose takes the spelling from other entries of the program and removes other suggestions
 * for the same words; a suggestion that is only seen sits beside them and never touches a fix that applies. A full list drops its oldest suggestion.
 */
export function remember(list: readonly Term[], fix: Candidate, opts: { now: number; app?: string | undefined; confirmed?: boolean | undefined; source?: string | undefined }): Term[] {
  const app = opts.app ? exeKey(opts.app) : undefined;
  const heard = squash(fix.heard);
  const correct = squash(fix.correct);
  if (!heard || !correct || sameText(heard, correct)) return [...list];
  const twin = list.find((t) => t.learned && sameText(t.learned.heard, heard) && sameText(t.word, correct) && t.app === app && t.soundsLike.some((s) => sameText(s, heard)));
  if (twin && !(opts.confirmed && twin.suggested && ownerOf(list, correct, app))) {
    const next = list.map((t) => (t === twin ? seenAgain(t, fix, opts) : t));
    return opts.confirmed ? release(next, [heard], twin.id, app).list : next;
  }
  const learned: Learned = { heard, count: 1, createdAt: opts.now, ...(fix.left && { left: fix.left }), ...(fix.right && { right: fix.right }), ...(opts.source && { sources: [opts.source] }) };
  const own = ownerOf(list, correct, app);
  if (own?.soundsLike.some((s) => sameText(s, heard))) return [...list];
  const rest = list.filter((t) => !(t.suggested && t.learned && sameText(t.learned.heard, heard) && t.app === app && (opts.confirmed || !isActive(t))));
  if (opts.confirmed && own) return extend(rest, own, learned);
  const open = room(rest);
  if (!open) return [...list];
  const entry: Term = { id: newId(), word: correct, soundsLike: [heard], ...(app && { app }), learned, ...(!opts.confirmed && { suggested: true }) };
  return opts.confirmed ? [...release(open, [heard], entry.id, app).list, entry] : [...open, entry];
}

/** The listed suggestions become saved entries, joining the entry for the same word and program when there is one. */
export function acceptSuggestions(list: readonly Term[], ids: readonly string[]): Term[] {
  const picked = list.filter((t) => t.suggested && t.learned && ids.includes(t.id));
  return picked.reduce<Term[]>(
    (acc, t) => {
      const rest = acc.filter((x) => x.id !== t.id);
      const own = ownerOf(rest, t.word, t.app);
      if (own && own.soundsLike.length >= MAX_SOUNDS && !own.soundsLike.some((s) => sameText(s, t.learned?.heard ?? ""))) return acc;
      return own ? extend(rest, own, t.learned as Learned) : [...release(rest, t.soundsLike, t.id, t.app).list, saved(t)];
    },
    [...list],
  );
}
