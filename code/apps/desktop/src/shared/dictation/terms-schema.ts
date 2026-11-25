import * as v from "valibot";
import { MAX_HEARD, MAX_SOUNDS, MAX_WORD } from "@speakkit/dictation";

export const idSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

const Learned = v.object({
  heard: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_HEARD)),
  count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000)),
  createdAt: v.pipe(v.number(), v.minValue(0)),
  left: v.optional(v.pipe(v.string(), v.maxLength(40))),
  right: v.optional(v.pipe(v.string(), v.maxLength(40))),
  sources: v.optional(v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(5))),
});

/** A word or name to write, how it is heard, where it applies and how it is swapped; a suggestion carries what was learned. */
export const TermSchema = v.object({
  id: idSchema,
  word: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_WORD)),
  soundsLike: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_HEARD))), v.maxLength(MAX_SOUNDS)),
  app: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(1), v.maxLength(80))),
  matchCase: v.optional(v.boolean()),
  remove: v.optional(v.boolean()),
  swapOnly: v.optional(v.boolean()),
  learned: v.optional(Learned),
  suggested: v.optional(v.boolean()),
});
export type TermOut = v.InferOutput<typeof TermSchema>;

const lower = (x: string) => x.toLowerCase();

/** A saved entry is one word in one program; a suggestion is one misheard phrase for a word in a program. */
export const termKeys = (t: TermOut): string[] => [`i:${t.id}`, t.suggested ? `s:${lower(t.word)}|${t.app ?? ""}|${lower(t.soundsLike[0] ?? "")}` : `w:${lower(t.word)}|${t.app ?? ""}`];
