import * as v from "valibot";
import { MAX_TERMS, mergeTerm, newId, sameText, type Learned, type Term } from "@speakkit/dictation";
import { TermSchema } from "./terms-schema";

/** Id of the settings migration that turns the old replacements and corrections into entries of the one list of words. */
export const VOCABULARY_MIGRATION_ID = "vocabulary-one-list";

const text = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const OldReplacement = v.object({ from: text(80), to: v.pipe(v.string(), v.maxLength(200)), matchCase: v.optional(v.boolean()) });
const OldCorrection = v.object({
  heard: text(80),
  correct: text(80),
  left: v.optional(v.pipe(v.string(), v.maxLength(40))),
  right: v.optional(v.pipe(v.string(), v.maxLength(40))),
  app: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(1), v.maxLength(80))),
  count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000)),
  createdAt: v.pipe(v.number(), v.minValue(0)),
  confirmed: v.optional(v.boolean()),
  sources: v.optional(v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(5))),
});
type Fix = v.InferOutput<typeof OldCorrection>;

/** The entries of `raw` that fit `schema`, and how many did not. */
function valid<T extends v.GenericSchema>(schema: T, raw: unknown): { items: v.InferOutput<T>[]; bad: number } {
  const all = Array.isArray(raw) ? raw : [];
  const items = all.flatMap((x) => {
    const r = v.safeParse(schema, x);
    return r.success ? [r.output] : [];
  });
  return { items, bad: all.length - items.length };
}

/**
 * A phrase and its replacement as an entry: the replacement is the word (written after the speech, never sent to the model), the phrase is heard as it; a phrase without
 * replacement is removed. A rule that cannot join an entry of the same word, or would write the word in other capitals, is counted as lost.
 */
function withRules(list: Term[], rules: v.InferOutput<typeof OldReplacement>[]): { list: Term[]; lost: number } {
  let lost = 0;
  let next = list;
  for (const { from, to, matchCase } of rules) {
    const res = mergeTerm(next, to ? { word: to, soundsLike: [from], matchCase, swapOnly: true } : { word: from, remove: true, matchCase });
    if (res.ok) {
      next = res.list;
      if (to && res.term.word !== to.trim()) lost++;
    } else if (res.error !== "duplicate") lost++;
  }
  return { list: next, lost };
}

const learnedOf = (f: Fix): Learned => ({
  heard: f.heard,
  count: f.count,
  createdAt: f.createdAt,
  ...(f.left && { left: f.left }),
  ...(f.right && { right: f.right }),
  ...(f.sources && { sources: f.sources }),
});

/** A fix saved on purpose joins the entry for its word; one that was only seen becomes a suggestion. A fix that is already there is left out without a word. */
function withFix(list: readonly Term[], f: Fix): Term[] | "lost" | "same" {
  const learned = learnedOf(f);
  if (f.confirmed) {
    const res = mergeTerm(list, { word: f.correct, soundsLike: [f.heard], app: f.app });
    if (!res.ok) return res.error === "duplicate" ? "same" : "lost";
    return res.list.map((t) => (t.id === res.term.id && !t.learned ? { ...t, learned } : t));
  }
  const there = list.some(
    (t) => t.app === f.app && sameText(t.word, f.correct) && (t.soundsLike.some((s) => sameText(s, f.heard)) || (t.suggested && t.learned && sameText(t.learned.heard, f.heard))),
  );
  if (there) return "same";
  if (list.length >= MAX_TERMS) return "lost";
  return [...list, { id: newId(), word: f.correct, soundsLike: [f.heard], ...(f.app && { app: f.app }), learned, suggested: true }];
}

function withFixes(list: Term[], fixes: Fix[]): { list: Term[]; lost: number } {
  let lost = 0;
  let next = list;
  for (const f of fixes) {
    const res = withFix(next, f);
    if (res === "lost") lost++;
    else if (res !== "same") next = res;
  }
  return { list: next, lost };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Entries of a list that are valid, as the list a mode or the shared settings holds. */
const termsOf = (raw: unknown): Term[] => valid(TermSchema, raw).items;

function unifyMode(mode: unknown): { mode: unknown; lost: number } {
  if (!isObject(mode) || !("replacements" in mode)) return { mode, lost: 0 };
  const { replacements, ...rest } = mode;
  const rules = valid(OldReplacement, replacements);
  const merged = withRules(termsOf(mode.terms), rules.items);
  return { mode: { ...rest, terms: merged.list }, lost: rules.bad + merged.lost };
}

/**
 * The stored dictation section with the old replacements (shared and per mode) and corrections turned into entries of the list of words: a replacement becomes
 * the word it writes, heard as the phrase; with an empty replacement the entry removes the phrase. A correction saved on purpose joins the entry for its
 * word; one that was only seen becomes a suggestion. Same entries are merged, and what does not fit (broken, or past the limit of the list) is counted in `dropped`.
 */
export function unifyVocabulary(dictation: Record<string, unknown>): { dictation: Record<string, unknown>; dropped: number } {
  const stored = Array.isArray(dictation.modes) ? dictation.modes : [];
  if (!("replacements" in dictation) && !("corrections" in dictation) && !stored.some((m) => isObject(m) && "replacements" in m)) return { dictation, dropped: 0 };
  const modes = stored.map(unifyMode);
  const { replacements, corrections, ...rest } = dictation;
  const rules = valid(OldReplacement, replacements);
  const fixes = valid(OldCorrection, corrections);
  const swapped = withRules(termsOf(dictation.terms), rules.items);
  const fixed = withFixes(swapped.list, fixes.items);
  const inModes = modes.reduce((n, m) => n + m.lost, 0);
  return { dictation: { ...rest, terms: fixed.list, ...(modes.length && { modes: modes.map((m) => m.mode) }) }, dropped: rules.bad + fixes.bad + swapped.lost + fixed.lost + inModes };
}
