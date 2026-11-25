import { exeKey } from "../paste-plan";
import type { Replacement } from "../settings";

/** What was learned from a fix made to dictated text. */
export interface Learned {
  /** The misheard words of the fix: one of the entry's heard-as spellings. */
  heard: string;
  /** How many dictations the same fix was seen in. */
  count: number;
  createdAt: number;
  /** The words next to the phrase when it was learned, lower case; they help find the same slip spelled a little differently. */
  left?: string | undefined;
  right?: string | undefined;
  /** The dictations (history entry ids) the fix was seen in, newest last, so seeing one dictation twice counts once. */
  sources?: string[] | undefined;
}

/**
 * A word or name to write, and what the speech engine tends to give instead (`soundsLike`, shown as "Heard as"). Rows are addressed by `id`, never by position.
 * A suggestion (`suggested`) is a fix the person made that waits for one click; it applies by itself once it was seen a second time.
 */
export interface Term {
  id: string;
  word: string;
  soundsLike: string[];
  /** Program name as `exeKey` gives it; the entry applies only there. Absent: everywhere. */
  app?: string | undefined;
  /** Only the exact capitals of the heard-as spellings match. */
  matchCase?: boolean | undefined;
  /** The heard-as spellings (and the word itself) are deleted from the text instead of swapped. */
  remove?: boolean | undefined;
  /** The word is not sent to the speech model as a hint. Absent: decided by the word (`swapOnlyByDefault`). */
  swapOnly?: boolean | undefined;
  learned?: Learned | undefined;
  suggested?: boolean | undefined;
}

export type TermOptions = Pick<Term, "app" | "matchCase" | "remove" | "swapOnly">;
export interface TermInput extends TermOptions {
  word: string;
  soundsLike?: readonly string[] | undefined;
}

export const MAX_TERMS = 500;
export const MAX_WORD = 200;
export const MAX_SOUNDS = 20;
export const MAX_HEARD = 80;
/** A fix that was not saved on purpose starts to apply when it was seen this many times. */
export const ACTIVE_COUNT = 2;

/** "conflict": the list has the same word for the same program with other options (capitals, remove), so new spellings cannot join it. */
export type TermError = "empty" | "too-long" | "duplicate" | "full" | "conflict";
export type TermResult = { ok: true; list: Term[]; term: Term; moved: string[] } | { ok: false; error: TermError; existing?: Term; length?: number };

export const sameText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const len = (s: string): number => [...s.trim()].length;

/** Trimmed, no blanks, no repeats (ignoring case). */
export function cleanSounds(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of raw.map((x) => x.trim().replace(/\s+/g, " "))) if (s && !out.some((o) => sameText(o, s))) out.push(s);
  return out;
}

let counter = 0;
export const newId = (): string => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Symbols or more than three words: an address, a path, a sentence. The speech model cannot be primed with those, so only the swap works. */
export const swapOnlyByDefault = (word: string): boolean => /[@/:\\]/.test(word) || word.trim().split(/\s+/).length > 3;

export const isSwapOnly = (t: Pick<Term, "word" | "swapOnly">): boolean => t.swapOnly ?? swapOnlyByDefault(t.word);

/** The entry applies now: a saved one always, a suggestion once it was seen often enough. */
export const isActive = (t: Term): boolean => !t.suggested || (t.learned?.count ?? 0) >= ACTIVE_COUNT;

/** Words the speech model gets as a hint. */
export const sendsToModel = (t: Term): boolean => !t.suggested && !t.remove && !isSwapOnly(t);

const appKey = (app: string | undefined): string | undefined => (app?.trim() ? exeKey(app.trim()) : undefined);

/** The entries that apply in the program in front: for everywhere or for this program, and active. */
export function usableTerms(terms: readonly Term[], exe: string | undefined): Term[] {
  const key = exe ? exeKey(exe) : undefined;
  return terms.filter((t) => (t.app === undefined || t.app === key) && isActive(t));
}

export function validateWord(list: readonly Term[], word: string, ignoreId?: string, app?: string): "empty" | "too-long" | "duplicate" | undefined {
  const w = word.trim();
  if (!w) return "empty";
  if (len(w) > MAX_WORD) return "too-long";
  if (saved(list, w, appKey(app), ignoreId)) return "duplicate";
  return undefined;
}

const saved = (list: readonly Term[], word: string, app: string | undefined, ignoreId?: string): Term | undefined =>
  list.find((t) => !t.suggested && t.id !== ignoreId && t.app === app && sameText(t.word, word));

// A heard-as spelling belongs to one word in a program: the newest owner takes it, so an exact match always replaces the same way.
export function release(list: readonly Term[], sounds: readonly string[], keepId: string, app: string | undefined): { list: Term[]; moved: string[] } {
  const moved: string[] = [];
  const next = list.map((t) => {
    if (t.id === keepId || t.suggested || t.app !== app) return t;
    const kept = t.soundsLike.filter((s) => {
      const taken = sounds.some((x) => sameText(x, s));
      if (taken) moved.push(s);
      return !taken;
    });
    return kept.length === t.soundsLike.length ? t : { ...t, soundsLike: kept };
  });
  return { list: next, moved };
}

function build(id: string, i: TermInput, learned?: Learned): Term {
  const word = i.word.trim();
  const app = appKey(i.app);
  return {
    id,
    word,
    soundsLike: cleanSounds(i.soundsLike ?? [])
      .filter((s) => s !== word)
      .slice(0, MAX_SOUNDS),
    ...(app && { app }),
    ...(i.matchCase && { matchCase: true }),
    ...(i.remove && { remove: true }),
    ...(i.swapOnly !== undefined && { swapOnly: i.swapOnly }),
    ...(learned && { learned }),
  };
}

export function addTerm(list: readonly Term[], input: TermInput): TermResult {
  const error = validateWord(list, input.word, undefined, input.app);
  if (error === "duplicate") return { ok: false, error, existing: saved(list, input.word.trim(), appKey(input.app)) as Term };
  if (error) return { ok: false, error, length: len(input.word) };
  if (list.length >= MAX_TERMS) return { ok: false, error: "full" };
  const term = build(newId(), input);
  const { list: others, moved } = release(list, term.soundsLike, term.id, term.app);
  return { ok: true, list: [...others, term], term, moved };
}

export function updateTerm(list: readonly Term[], id: string, patch: Partial<TermInput>): TermResult {
  const cur = list.find((t) => t.id === id);
  if (!cur) return { ok: false, error: "empty" };
  const input: TermInput = { word: cur.word, soundsLike: cur.soundsLike, app: cur.app, matchCase: cur.matchCase, remove: cur.remove, swapOnly: cur.swapOnly, ...patch };
  const error = validateWord(list, input.word, id, input.app);
  if (error === "duplicate") return { ok: false, error, existing: saved(list, input.word.trim(), appKey(input.app), id) as Term };
  if (error) return { ok: false, error, length: len(input.word) };
  const term = build(id, input, cur.learned);
  const { list: others, moved } = release(list, term.soundsLike, id, term.app);
  return { ok: true, list: others.map((t) => (t.id === id ? term : t)), term, moved };
}

/** By id: deleting twice, or a row that is already gone, changes nothing. */
export const removeTerm = (list: readonly Term[], id: string): Term[] => list.filter((t) => t.id !== id);

/**
 * Adds an entry, or, when the list has one with the same word and program and the same options, adds its spellings to that entry.
 * Says "duplicate" when nothing new would be added and "conflict" when the options differ. Whether the word goes to the speech model stays as the saved entry has it.
 */
export function mergeTerm(list: readonly Term[], input: TermInput): TermResult {
  const twin = saved(list, input.word.trim(), appKey(input.app));
  if (!twin) return addTerm(list, input);
  const sameOptions = !!twin.matchCase === !!input.matchCase && !!twin.remove === !!input.remove;
  const fresh = cleanSounds(input.soundsLike ?? []).filter((s) => s !== twin.word && !twin.soundsLike.some((o) => sameText(o, s)));
  if (!sameOptions) return { ok: false, error: "conflict", existing: twin };
  if (!fresh.length) return { ok: false, error: "duplicate", existing: twin };
  if (twin.soundsLike.length + fresh.length > MAX_SOUNDS) return { ok: false, error: "full" };
  return updateTerm(list, twin.id, { soundsLike: [...twin.soundsLike, ...fresh] });
}

/** Shared words plus a mode's own: when both spell the same word, or claim the same sounds-like, the mode's wins. */
export function mergeTerms(shared: readonly Term[], own: readonly Term[]): Term[] {
  const sounds = new Set(own.flatMap((t) => t.soundsLike.map((s) => s.toLowerCase())));
  const words = new Set(own.map((t) => `${t.word.toLowerCase()}|${t.app ?? ""}`));
  const kept = shared.filter((t) => !words.has(`${t.word.toLowerCase()}|${t.app ?? ""}`)).map((t) => ({ ...t, soundsLike: t.soundsLike.filter((s) => !sounds.has(s.toLowerCase())) }));
  return [...kept, ...own];
}

/** True when `term` spells a shared word, or claims a shared sounds-like, differently from the shared list ("Replaces the shared spelling"). */
export const overridesShared = (shared: readonly Term[], term: Term): boolean =>
  shared.some((t) => sameText(t.word, term.word) || t.soundsLike.some((s) => term.soundsLike.some((x) => sameText(x, s))));

/** The spellings an entry swaps: its heard-as spellings, and for an entry that removes text, the word itself too. */
const phrases = (t: Term): string[] => (t.remove ? [t.word, ...t.soundsLike] : t.soundsLike);

/** The spelling that was learned from a fix keeps the care a fix gets (a cap per dictation, capitals as the text has them); an entry with options asks for the plain swap instead. */
const appliesAsFix = (t: Term, from: string): boolean => !!t.learned && !t.matchCase && !t.remove && sameText(from, t.learned.heard);

/** A misheard phrase and the words it should have been; for a program, for everywhere when `app` is absent. */
export interface Fix {
  heard: string;
  correct: string;
  left?: string | undefined;
  right?: string | undefined;
  app?: string | undefined;
  /** The person saved it on purpose; it wins over one that was only seen twice. */
  confirmed?: boolean | undefined;
}

/** Rules for the replacement pass: every heard-as spelling becomes the word, and a phrase an entry removes becomes nothing. Rules for the program in front come first. */
export function swapRules(terms: readonly Term[], exe: string | undefined): Replacement[] {
  const mine = usableTerms(terms, exe);
  return [...mine.filter((t) => t.app), ...mine.filter((t) => !t.app)].flatMap((t) =>
    phrases(t)
      .filter((from) => !appliesAsFix(t, from))
      .map((from) => ({ from, to: t.remove ? "" : t.word, ...(t.matchCase && { matchCase: true }) })),
  );
}

/** The learned fixes that apply after the replacement pass, with their own safeguards. */
export const activeFixes = (terms: readonly Term[], exe: string | undefined): Fix[] =>
  usableTerms(terms, exe).flatMap((t) =>
    t.soundsLike.filter((from) => appliesAsFix(t, from)).map((heard) => ({ heard, correct: t.word, ...(t.app && { app: t.app }), ...(!t.suggested && { confirmed: true }) })),
  );

/** Every misheard spelling that may be spelled a little differently in the text, for the writer's hints; a learned one brings the neighbours it was learned with. */
export const hintFixes = (terms: readonly Term[], exe: string | undefined): Fix[] =>
  usableTerms(terms, exe)
    .filter((t) => !t.remove)
    .flatMap((t) =>
      t.soundsLike.map((heard) => {
        const l = t.learned && sameText(heard, t.learned.heard) ? t.learned : undefined;
        return { heard, correct: t.word, ...(l?.left && { left: l.left }), ...(l?.right && { right: l.right }) };
      }),
    );

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
