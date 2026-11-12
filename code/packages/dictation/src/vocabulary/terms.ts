/** A word or name and the spellings the speech engine tends to give it. Rows are addressed by `id`, never by position. */
export interface Term {
  id: string;
  word: string;
  soundsLike: string[];
}

export const MAX_TERMS = 500;
export const MAX_WORD = 60;

export type TermError = "empty" | "too-long" | "duplicate" | "full";
export type TermResult = { ok: true; list: Term[]; term: Term; moved: string[] } | { ok: false; error: TermError; existing?: Term; length?: number };

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const len = (s: string): number => [...s.trim()].length;

/** Trimmed, no blanks, no repeats (ignoring case). */
export function cleanSounds(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of raw.map((x) => x.trim().replace(/\s+/g, " "))) if (s && !out.some((o) => same(o, s))) out.push(s);
  return out;
}

let counter = 0;
export const newId = (): string => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export function validateWord(list: readonly Term[], word: string, ignoreId?: string): "empty" | "too-long" | "duplicate" | undefined {
  const w = word.trim();
  if (!w) return "empty";
  if (len(w) > MAX_WORD) return "too-long";
  if (list.some((t) => t.id !== ignoreId && same(t.word, w))) return "duplicate";
  return undefined;
}

// A sounds-like spelling belongs to one word: the newest owner takes it, so an exact match always replaces the same way.
function release(list: readonly Term[], sounds: readonly string[], keepId: string): { list: Term[]; moved: string[] } {
  const moved: string[] = [];
  const next = list.map((t) => {
    if (t.id === keepId) return t;
    const kept = t.soundsLike.filter((s) => {
      const taken = sounds.some((x) => same(x, s));
      if (taken) moved.push(s);
      return !taken;
    });
    return kept.length === t.soundsLike.length ? t : { ...t, soundsLike: kept };
  });
  return { list: next, moved };
}

export function addTerm(list: readonly Term[], input: { word: string; soundsLike?: readonly string[] }): TermResult {
  const error = validateWord(list, input.word);
  if (error === "duplicate") return { ok: false, error, existing: list.find((t) => same(t.word, input.word)) as Term };
  if (error) return { ok: false, error, length: len(input.word) };
  if (list.length >= MAX_TERMS) return { ok: false, error: "full" };
  const term: Term = { id: newId(), word: input.word.trim(), soundsLike: cleanSounds(input.soundsLike ?? []).filter((s) => !same(s, input.word)) };
  const { list: others, moved } = release(list, term.soundsLike, term.id);
  return { ok: true, list: [...others, term], term, moved };
}

export function updateTerm(list: readonly Term[], id: string, patch: { word?: string; soundsLike?: readonly string[] }): TermResult {
  const cur = list.find((t) => t.id === id);
  if (!cur) return { ok: false, error: "empty" };
  const word = patch.word ?? cur.word;
  const error = validateWord(list, word, id);
  if (error === "duplicate") return { ok: false, error, existing: list.find((t) => t.id !== id && same(t.word, word)) as Term };
  if (error) return { ok: false, error, length: len(word) };
  const term: Term = { id, word: word.trim(), soundsLike: cleanSounds(patch.soundsLike ?? cur.soundsLike).filter((s) => !same(s, word)) };
  const { list: others, moved } = release(list, term.soundsLike, id);
  return { ok: true, list: others.map((t) => (t.id === id ? term : t)), term, moved };
}

/** By id: deleting twice, or a row that is already gone, changes nothing. */
export const removeTerm = (list: readonly Term[], id: string): Term[] => list.filter((t) => t.id !== id);

/** Shared words plus a mode's own: when both spell the same word, or claim the same sounds-like, the mode's wins. */
export function mergeTerms(shared: readonly Term[], own: readonly Term[]): Term[] {
  const sounds = new Set(own.flatMap((t) => t.soundsLike.map((s) => s.toLowerCase())));
  const words = new Set(own.map((t) => t.word.toLowerCase()));
  const kept = shared.filter((t) => !words.has(t.word.toLowerCase())).map((t) => ({ ...t, soundsLike: t.soundsLike.filter((s) => !sounds.has(s.toLowerCase())) }));
  return [...kept, ...own];
}

/** True when `term` spells a shared word, or claims a shared sounds-like, differently from the shared list ("Replaces the shared spelling"). */
export const overridesShared = (shared: readonly Term[], term: Term): boolean => shared.some((t) => same(t.word, term.word) || t.soundsLike.some((s) => term.soundsLike.some((x) => same(x, s))));

/** Rules for the replacement pass: every sounds-like spelling becomes the word. */
export const soundsLikeRules = (terms: readonly Term[]): { from: string; to: string }[] => terms.flatMap((t) => t.soundsLike.map((from) => ({ from, to: t.word })));

/** Search aliases: terms with a sounds-like spelling that contains every word of the query. */
export function matchTerms(terms: readonly Term[], query: string): { term: Term; via: string }[] {
  const words = query.toLowerCase().match(/\S+/g) ?? [];
  if (!words.length) return [];
  const out: { term: Term; via: string }[] = [];
  for (const term of terms) {
    const via = term.soundsLike.find((s) => words.every((w) => s.toLowerCase().includes(w)));
    if (via) out.push({ term, via });
  }
  return out;
}
