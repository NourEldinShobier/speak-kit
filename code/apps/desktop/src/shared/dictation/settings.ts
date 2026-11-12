import * as v from "valibot";
import { DEFAULT_HOTKEY, validHotkey } from "./keys";

export const DICTATION_MODELS = ["large-v3-turbo-q5_0", "parakeet-tdt-0.6b-v3-q4_0"] as const;
export type DictationModelId = (typeof DICTATION_MODELS)[number];
export const DICTATION_LANGUAGES = ["auto", "en", "de", "ar"] as const;
export const RETENTIONS = ["off", "24h", "7d", "30d", "forever"] as const;
export const MAX_REPLACEMENTS = 100;

export const MAX_TERMS = 500;
export const MAX_MODES = 24;

export type Replacement = { from: string; to: string; matchCase?: boolean | undefined };
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const Term = v.object({
  id,
  word: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  soundsLike: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60))), v.maxLength(20)),
});
const Pronunciation = v.object({ id, written: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)), spoken: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)) });
const DEFAULT_ID = "default";
const lower = (x: string) => x.toLowerCase();
const termKeys = (t: { id: string; word: string }) => [`i:${t.id}`, `w:${lower(t.word)}`];
const distinct = (keys: string[]): boolean => new Set(keys).size === keys.length;
// A bad or repeated entry is dropped, the rest of the list stays.
const lenient = <T extends v.GenericSchema>(item: T, max: number, keys: (x: v.InferOutput<T>) => string[] = () => []) =>
  v.fallback(
    v.pipe(
      v.array(v.unknown()),
      v.transform((items) => {
        const seen = new Set<string>();
        return items
          .flatMap((i) => {
            const r = v.safeParse(item, i);
            if (!r.success) return [];
            const k = keys(r.output as v.InferOutput<T>);
            if (k.some((x) => seen.has(x))) return [];
            k.forEach((x) => seen.add(x));
            return [r.output as v.InferOutput<T>];
          })
          .slice(0, max);
      }),
    ),
    [] as v.InferOutput<T>[],
  );
type TermOut = v.InferOutput<typeof Term>;
const termList = v.pipe(
  v.array(Term),
  v.maxLength(MAX_TERMS),
  v.check((items: TermOut[]) => distinct(items.flatMap(termKeys)), "Words must be different"),
);
const modeEntries = {
  id,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
  apps: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(1), v.maxLength(80))), v.maxLength(50)),
  insertMode: v.picklist(["paste", "type", "copy"]),
  capitals: v.picklist(["keep", "sentence", "lower"]),
  end: v.picklist(["keep", "no-full-stop"]),
  rewrite: v.boolean(),
};
type ModeOut = v.InferOutput<ReturnType<typeof v.object<typeof modeEntries & { terms: typeof termList }>>>;
// The built-in default mode lists no apps and keeps its name; no other mode may take that name.
const nameFree = (m: ModeOut): boolean => m.id === DEFAULT_ID || lower(m.name) !== "default";
const settleDefault = (m: ModeOut): ModeOut => (m.id === DEFAULT_ID ? { ...m, name: "Default", apps: [] } : m);
const Mode = v.pipe(v.object({ ...modeEntries, terms: termList }), v.check(nameFree, "That name is taken"), v.transform(settleDefault));
const LenientMode = v.pipe(v.object({ ...modeEntries, terms: lenient(Term, MAX_TERMS, termKeys) }), v.check(nameFree), v.transform(settleDefault));
const modeKeys = (m: { id: string; name: string }) => [`i:${m.id}`, `n:${lower(m.name)}`];
const modeList = v.pipe(
  v.array(Mode),
  v.maxLength(MAX_MODES),
  v.check((items: ModeOut[]) => distinct(items.flatMap(modeKeys)), "Modes must have different names"),
);
const bool = (d: boolean) => v.fallback(v.boolean(), d);

/** The clean-up switches. Every one is on, as before they could be changed, except the two new transformations. */
export const CleanupSchema = v.fallback(
  v.object({
    fillers: bool(true),
    spokenSymbols: bool(true),
    spokenFormatting: bool(true),
    autoCapitalize: bool(true),
    trailingSpace: bool(true),
    lowercase: bool(false),
    stripFinalStop: bool(false),
  }),
  { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, trailingSpace: true, lowercase: false, stripFinalStop: false },
);
export type Cleanup = v.InferOutput<typeof CleanupSchema>;

/** The rewrite pass is off until the person turns it on, because the text leaves the computer. */
export const RewriteSchema = v.fallback(v.object({ enabled: bool(false), deadlineMs: v.fallback(v.pipe(v.number(), v.integer(), v.minValue(1000), v.maxValue(15_000)), 4000) }), {
  enabled: false,
  deadlineMs: 4000,
});
const Replacement = v.object({ from: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)), to: v.pipe(v.string(), v.maxLength(200)), matchCase: v.optional(v.boolean()) });
const hotkey = v.fallback(v.pipe(v.string(), v.check(validHotkey)), DEFAULT_HOTKEY);
// A bad entry is dropped, the rest of the list stays.
const replacements = v.fallback(
  v.pipe(
    v.array(v.unknown()),
    v.transform((items) =>
      items
        .flatMap((i) => {
          const r = v.safeParse(Replacement, i);
          return r.success ? [r.output] : [];
        })
        .slice(0, MAX_REPLACEMENTS),
    ),
  ),
  [],
);

/** Persisted under `dictation` in config.json. Off until the person turns it on; every key falls back to its default, which is also how files from before dictation existed load. */
export const DictationConfigSchema = v.object({
  enabled: v.fallback(v.boolean(), false),
  hotkey,
  mode: v.fallback(v.picklist(["hold", "toggle"]), "hold"),
  language: v.fallback(v.picklist(DICTATION_LANGUAGES), "auto"),
  model: v.fallback(v.picklist(DICTATION_MODELS), DICTATION_MODELS[0]),
  retention: v.fallback(v.picklist(RETENTIONS), "7d"),
  replacements,
  terms: v.fallback(lenient(Term, MAX_TERMS, termKeys), []),
  readAs: v.fallback(
    lenient(Pronunciation, 200, (p) => [`i:${p.id}`]),
    [],
  ),
  /** Send the words to the speech model as a prompt (models that cannot read one drop it). */
  prompt: bool(true),
  cleanup: CleanupSchema,
  modes: v.fallback(lenient(LenientMode, MAX_MODES, modeKeys), []),
  rewrite: RewriteSchema,
  keepRecordings: bool(false),
});
export type DictationConfig = v.InferOutput<typeof DictationConfigSchema>;

const count = (x: unknown): number => (Array.isArray(x) ? x.length : 0);

/**
 * How many entries of the stored dictation section loading leaves out: words, pronunciations, replacements and modes that are broken, repeated or over
 * the limit, and the words inside a mode that are. The person is told, so nothing disappears without a word.
 */
export function countDropped(raw: unknown): number {
  if (typeof raw !== "object" || raw === null) return 0;
  const r = raw as Record<string, unknown>;
  const kept = v.parse(DictationConfigSchema, r);
  const lists = (["terms", "readAs", "replacements", "modes"] as const).reduce((n, k) => n + Math.max(0, count(r[k]) - kept[k].length), 0);
  // Words inside the modes that were kept: a bad word costs the word, not the mode.
  const insideKept = kept.modes.reduce((n, m) => n + m.terms.length, 0);
  const insideRaw = (Array.isArray(r.modes) ? r.modes : []).reduce((n: number, m: unknown) => (v.safeParse(LenientMode, m).success ? n + count((m as { terms?: unknown }).terms) : n), 0);
  return lists + Math.max(0, insideRaw - insideKept);
}

/** What the renderer may change; `enabled` has its own call because turning dictation on starts the hook and the microphone window. */
export const DictationPatchSchema = v.partial(
  v.strictObject({
    hotkey: v.pipe(v.string(), v.check(validHotkey)),
    mode: v.picklist(["hold", "toggle"]),
    language: v.picklist(DICTATION_LANGUAGES),
    model: v.picklist(DICTATION_MODELS),
    retention: v.picklist(RETENTIONS),
    replacements: v.pipe(v.array(Replacement), v.maxLength(MAX_REPLACEMENTS)),
    terms: termList,
    readAs: v.pipe(
      v.array(Pronunciation),
      v.maxLength(200),
      v.check((items: v.InferOutput<typeof Pronunciation>[]) => distinct(items.map((p) => `i:${p.id}`)), "Entries must have different ids"),
    ),
    prompt: v.boolean(),
    cleanup: v.strictObject({
      fillers: v.boolean(),
      spokenSymbols: v.boolean(),
      spokenFormatting: v.boolean(),
      autoCapitalize: v.boolean(),
      trailingSpace: v.boolean(),
      lowercase: v.boolean(),
      stripFinalStop: v.boolean(),
    }),
    modes: modeList,
    rewrite: v.strictObject({ enabled: v.boolean(), deadlineMs: v.pipe(v.number(), v.integer(), v.minValue(1000), v.maxValue(15_000)) }),
    keepRecordings: v.boolean(),
  }),
);
export type DictationPatch = v.InferOutput<typeof DictationPatchSchema>;
