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
const Term = v.object({ id, word: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)), soundsLike: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60))), v.maxLength(20)) });
const Pronunciation = v.object({ id, written: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)), spoken: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)) });
const Mode = v.object({
  id,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
  apps: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(1), v.maxLength(80))), v.maxLength(50)),
  insertMode: v.picklist(["paste", "type", "copy"]),
  capitals: v.picklist(["keep", "sentence", "lower"]),
  end: v.picklist(["keep", "no-full-stop"]),
  rewrite: v.boolean(),
  terms: v.pipe(v.array(Term), v.maxLength(MAX_TERMS)),
});
// A bad entry is dropped, the rest of the list stays.
const lenient = <T extends v.GenericSchema>(item: T, max: number) =>
  v.fallback(
    v.pipe(
      v.array(v.unknown()),
      v.transform((items) =>
        items
          .flatMap((i) => {
            const r = v.safeParse(item, i);
            return r.success ? [r.output as v.InferOutput<T>] : [];
          })
          .slice(0, max),
      ),
    ),
    [] as v.InferOutput<T>[],
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
export const RewriteSchema = v.fallback(v.object({ enabled: bool(false), deadlineMs: v.fallback(v.pipe(v.number(), v.integer(), v.minValue(1000), v.maxValue(15_000)), 4000) }), { enabled: false, deadlineMs: 4000 });
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
  terms: v.fallback(lenient(Term, MAX_TERMS), []),
  readAs: v.fallback(lenient(Pronunciation, 200), []),
  /** Send the words to the speech model as a prompt (models that cannot read one drop it). */
  prompt: bool(true),
  cleanup: CleanupSchema,
  modes: v.fallback(lenient(Mode, MAX_MODES), []),
  rewrite: RewriteSchema,
  keepRecordings: bool(false),
});
export type DictationConfig = v.InferOutput<typeof DictationConfigSchema>;

/** What the renderer may change; `enabled` has its own call because turning dictation on starts the hook and the microphone window. */
export const DictationPatchSchema = v.partial(
  v.strictObject({
    hotkey: v.pipe(v.string(), v.check(validHotkey)),
    mode: v.picklist(["hold", "toggle"]),
    language: v.picklist(DICTATION_LANGUAGES),
    model: v.picklist(DICTATION_MODELS),
    retention: v.picklist(RETENTIONS),
    replacements: v.pipe(v.array(Replacement), v.maxLength(MAX_REPLACEMENTS)),
    terms: v.pipe(v.array(Term), v.maxLength(MAX_TERMS)),
    readAs: v.pipe(v.array(Pronunciation), v.maxLength(200)),
    prompt: v.boolean(),
    cleanup: v.strictObject({ fillers: v.boolean(), spokenSymbols: v.boolean(), spokenFormatting: v.boolean(), autoCapitalize: v.boolean(), trailingSpace: v.boolean(), lowercase: v.boolean(), stripFinalStop: v.boolean() }),
    modes: v.pipe(v.array(Mode), v.maxLength(MAX_MODES)),
    rewrite: v.strictObject({ enabled: v.boolean(), deadlineMs: v.pipe(v.number(), v.integer(), v.minValue(1000), v.maxValue(15_000)) }),
    keepRecordings: v.boolean(),
  }),
);
export type DictationPatch = v.InferOutput<typeof DictationPatchSchema>;
