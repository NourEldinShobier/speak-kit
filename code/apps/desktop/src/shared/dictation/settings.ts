import * as v from "valibot";
import { DEFAULT_TEMPLATE, MAX_STYLE_LINE, MAX_STYLE_NAME, MAX_STYLE_PROMPT, MAX_STYLES, normalizeSite, TEMPLATE_IDS } from "@speakkit/dictation";
import { firstClash, type Shortcuts } from "./conflicts";
import { AUDIO_CAPS_MB, INDICATORS, SoundsSchema } from "./feedback";
export { AUDIO_CAPS_MB, type Indicator } from "./feedback";
import { DEFAULT_HOTKEY, DEFAULT_PASTE_LAST, validCancelKey, validHotkey } from "./keys";
import { unifyVocabulary, VOCABULARY_MIGRATION_ID } from "./legacy-vocabulary";
import { DICTATION_MODELS } from "./models";
import { idSchema as id, TermSchema as Term, termKeys, type TermOut } from "./terms-schema";
import { SPOKEN_LANGUAGE_CODES } from "../speech-models/config";

/** A catalog model, or one the person added from a file ("custom-" and twelve hex digits of its fingerprint). */
export type DictationModelId = (typeof DICTATION_MODELS)[number] | `custom-${string}`;
export const modelId = v.union([
  v.picklist(DICTATION_MODELS),
  v.pipe(
    v.string(),
    v.regex(/^custom-[0-9a-f]{12}$/),
    v.transform((s) => s as `custom-${string}`),
  ),
]);
/** "keyboard": each dictation uses the language of the keyboard layout in the window in front. */
export const DICTATION_LANGUAGES = ["auto", "keyboard", ...SPOKEN_LANGUAGE_CODES] as const;
export const DUCK_MODES = ["nothing", "mute", "lower", "pause"] as const;
export const RETENTIONS = ["off", "24h", "7d", "30d", "forever"] as const;
/** Who tidies the text in the rewrite pass: OpenAI (the text leaves the computer) or the model on this computer. */
export const REWRITE_WRITERS = ["openai", "local"] as const;
/** How dictated text leaves the app: put back the old clipboard after pasting, leave the text on it, or only copy. */
export const OUTPUTS = ["restore", "keep", "copy"] as const;

export const MAX_TERMS = 500;
export const MAX_MODES = 24;

const Pronunciation = v.object({ id, written: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)), spoken: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)) });
const DEFAULT_ID = "default";
const lower = (x: string) => x.toLowerCase();
const distinct = (keys: string[]): boolean => new Set(keys).size === keys.length;
const bool = (d: boolean) => v.fallback(v.boolean(), d);
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
const termList = v.pipe(
  v.array(Term),
  v.maxLength(MAX_TERMS),
  v.check((items: TermOut[]) => distinct(items.flatMap(termKeys)), "Words must be different"),
);
// A built-in template, or a style the person wrote ("u-" and random characters). Whether a custom one still exists is decided where it is used, so a deleted one falls back to Tidy.
const customId = v.pipe(v.string(), v.regex(/^u-[a-z0-9]{1,20}$/));
const styleId = v.union([v.picklist(TEMPLATE_IDS), customId]);
const Style = v.object({
  id: customId,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_STYLE_NAME)),
  line: v.fallback(v.pipe(v.string(), v.trim(), v.maxLength(MAX_STYLE_LINE)), ""),
  prompt: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_STYLE_PROMPT)),
  keepsLists: bool(false),
});
const styleKeys = (s: { id: string }) => [`i:${s.id}`];
const modeEntries = {
  id,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
  apps: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(1), v.maxLength(80))), v.maxLength(50)),
  /** Website host names; a name that is not one is dropped, a repeated one kept once. Modes saved before sites existed have none. */
  sites: v.fallback(
    v.pipe(
      v.array(v.pipe(v.string(), v.transform(normalizeSite))),
      v.transform((l) => [...new Set(l.filter(Boolean))].slice(0, 50)),
    ),
    [],
  ),
  rewrite: v.boolean(),
  /** How the rewrite pass words the text; modes saved before templates existed, or with an unknown one, use Tidy. */
  template: v.fallback(styleId, DEFAULT_TEMPLATE),
};
type ModeOut = v.InferOutput<ReturnType<typeof v.object<typeof modeEntries & { terms: typeof termList }>>>;
// The built-in default mode is not stored: a saved one (from before it was fixed) is dropped, and no mode may take its id or name.
const notDefault = (m: ModeOut): boolean => m.id !== DEFAULT_ID && lower(m.name) !== "default";
const Mode = v.pipe(v.object({ ...modeEntries, terms: termList }), v.check(notDefault, "That name is taken"));
const LenientMode = v.pipe(v.object({ ...modeEntries, terms: lenient(Term, MAX_TERMS, termKeys) }), v.check(notDefault));
const modeKeys = (m: { id: string; name: string }) => [`i:${m.id}`, `n:${lower(m.name)}`];
const modeList = v.pipe(
  v.array(Mode),
  v.maxLength(MAX_MODES),
  v.check((items: ModeOut[]) => distinct(items.flatMap(modeKeys)), "Modes must have different names"),
);

/** The clean-up switches. Every one is on, as before they could be changed, except the two new transformations. */
export const CleanupSchema = v.fallback(
  v.object({
    fillers: bool(true),
    spokenSymbols: bool(true),
    spokenFormatting: bool(true),
    autoCapitalize: bool(true),
    trailingSpace: bool(true),
    stripFinalStop: bool(false),
  }),
  { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, trailingSpace: true, stripFinalStop: false },
);
export type Cleanup = v.InferOutput<typeof CleanupSchema>;

/** The rewrite pass is off until the person turns it on, because the text leaves the computer. A file from before the time limit was removed still carries `deadlineMs`; it is ignored. */
export const RewriteSchema = v.fallback(v.object({ enabled: bool(false) }), { enabled: false });
const hotkey = v.fallback(v.pipe(v.string(), v.check(validHotkey)), DEFAULT_HOTKEY);
/** "" is unset. */
const optionalHotkey = (fallback: string) => v.fallback(v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]), fallback);
export const MODES = ["hold", "hold-only", "toggle", "double-tap", "tap-or-hold"] as const;

/** Persisted under `dictation` in config.json. Off until the person turns it on; every key falls back to its default, which is also how files from before dictation existed load. */
const CORE_KEYS = {
  enabled: v.fallback(v.boolean(), false),
  hotkey,
  mode: v.fallback(v.picklist(MODES), "hold"),
  pasteLastHotkey: optionalHotkey(DEFAULT_PASTE_LAST),
  /** Reads the text of the field once, to learn what the person fixed in the last dictation; unset by default. */
  learnHotkey: optionalHotkey(""),
  cancelKey: v.fallback(v.pipe(v.string(), v.check(validCancelKey)), "Escape"),
  /** Set when a saved shortcut was refused at load and replaced: the page says so once. */
  resetNotice: v.fallback(v.optional(v.literal("clash")), undefined),
  // An explicit language is the default: automatic detection can mistranscribe close languages, so it is something the person chooses.
  language: v.fallback(v.picklist(DICTATION_LANGUAGES), "en"),
  model: v.fallback(modelId, DICTATION_MODELS[0]),
  retention: v.fallback(v.picklist(RETENTIONS), "7d"),
  /** Device id of the chosen microphone; empty means the system default, never a virtual input. */
  microphone: v.fallback(v.pipe(v.string(), v.maxLength(300)), ""),
  avoidBluetooth: v.fallback(v.boolean(), true),
  /** Keep the microphone open between recordings, for the audio before the key press. */
  keepReady: v.fallback(v.boolean(), false),
  output: v.fallback(v.picklist(OUTPUTS), "restore"),
  skipPauses: v.fallback(v.boolean(), false),
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
  rewriteWriter: v.fallback(v.picklist(REWRITE_WRITERS), "openai"),
  /** The style for apps that are in no mode; "off" leaves their text as said, which is what a file from before this setting does. */
  rewriteDefault: v.fallback(v.union([v.literal("off"), styleId]), "off"),
  /** The rewrite styles the person wrote; a bad or repeated one is dropped alone. */
  styles: v.fallback(lenient(Style, MAX_STYLES, styleKeys), []),
  keepRecordings: bool(false),
  /** Add a space before the text when the character before the caret is a letter, digit or closing punctuation. */
  smartSpacing: bool(false),
  /** Short tones when a recording starts, stops and fails. Off until the person turns them on; volume is 0 to 100. */
  sounds: v.fallback(SoundsSchema, { enabled: false, volume: 50 }),
  indicator: v.fallback(v.picklist(INDICATORS), "bottom"),
  audioCapMb: v.fallback(v.picklist(AUDIO_CAPS_MB), 512),
  /** What happens to other audio while a recording runs. */
  duckAudio: v.fallback(v.picklist(DUCK_MODES), "nothing"),
  /** Leave other audio alone when the sound goes to headphones, which the microphone cannot hear. */
  duckSpeakersOnly: bool(true),
  /** Percent of the current volume kept while dictating when other audio is lowered; 0 is silent, 100 changes nothing. */
  duckLevel: v.fallback(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)), 30),
};
export const hotkeySlots = (c: { hotkey: string; pasteLastHotkey: string; learnHotkey: string; cancelKey: string }): Shortcuts => ({
  dictation: c.hotkey,
  pasteLast: c.pasteLastHotkey,
  learn: c.learnHotkey,
  cancel: c.cancelKey,
});
export const DictationConfigSchema = v.pipe(
  v.object(CORE_KEYS),
  // Two shortcuts that share a key cannot both work: the optional one that clashes is cleared.
  v.transform((c) => {
    let out = c;
    for (let i = 0; i < 6; i++) {
      const clash = firstClash(hotkeySlots(out));
      if (!clash) break;
      const drop = (["pasteLast", "learn", "cancel"] as const).find((slot) => clash.includes(slot));
      if (!drop) break;
      out = {
        ...out,
        resetNotice: "clash" as const,
        ...(drop === "pasteLast" && { pasteLastHotkey: DEFAULT_PASTE_LAST }),
        ...(drop === "learn" && { learnHotkey: "" }),
        ...(drop === "cancel" && { cancelKey: "Escape" }),
      };
    }
    return out;
  }),
);
export type DictationConfig = v.InferOutput<typeof DictationConfigSchema>;

const count = (x: unknown): number => (Array.isArray(x) ? x.length : 0);

/**
 * How many entries of the stored dictation section loading leaves out: words, pronunciations, modes and styles that are broken, repeated or over the limit, the words inside a
 * mode that are, and the old replacements and corrections that did not fit the one list of words. The person is told, so nothing disappears without a word.
 * `applied` are the migrations already run: once the old lists were turned into words they are not looked for again.
 */
export function countDropped(raw: unknown, applied: readonly string[] = []): number {
  if (typeof raw !== "object" || raw === null) return 0;
  const r = raw as Record<string, unknown>;
  const kept = v.parse(DictationConfigSchema, r);
  // A saved default mode is dropped on purpose, so it is not counted as lost.
  const savedModes = Array.isArray(r.modes) ? r.modes.filter((m: unknown) => (m as { id?: unknown } | null)?.id !== DEFAULT_ID) : [];
  const lists = (["terms", "readAs", "modes", "styles"] as const).reduce((n, k) => n + Math.max(0, count(k === "modes" ? savedModes : r[k]) - kept[k].length), 0);
  // Words inside the modes that were kept: a bad word costs the word, not the mode.
  const insideKept = kept.modes.reduce((n, m) => n + m.terms.length, 0);
  const insideRaw = (Array.isArray(r.modes) ? r.modes : []).reduce((n: number, m: unknown) => (v.safeParse(LenientMode, m).success ? n + count((m as { terms?: unknown }).terms) : n), 0);
  const old = applied.includes(VOCABULARY_MIGRATION_ID) ? 0 : unifyVocabulary(r).dropped;
  return lists + Math.max(0, insideRaw - insideKept) + old;
}

/** What the renderer may change; `enabled` has its own call because turning dictation on starts the hook and the microphone window. */
export const DictationPatchSchema = v.partial(
  v.strictObject({
    hotkey: v.pipe(v.string(), v.check(validHotkey)),
    mode: v.picklist(MODES),
    pasteLastHotkey: v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]),
    learnHotkey: v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]),
    cancelKey: v.pipe(v.string(), v.check(validCancelKey)),
    language: v.picklist(DICTATION_LANGUAGES),
    model: modelId,
    retention: v.picklist(RETENTIONS),
    microphone: v.pipe(v.string(), v.maxLength(300)),
    avoidBluetooth: v.boolean(),
    keepReady: v.boolean(),
    output: v.picklist(OUTPUTS),
    skipPauses: v.boolean(),
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
      stripFinalStop: v.boolean(),
    }),
    modes: modeList,
    rewrite: v.strictObject({ enabled: v.boolean() }),
    rewriteWriter: v.picklist(REWRITE_WRITERS),
    rewriteDefault: v.union([v.literal("off"), styleId]),
    styles: v.pipe(
      v.array(Style),
      v.maxLength(MAX_STYLES),
      v.check((items: v.InferOutput<typeof Style>[]) => distinct(items.flatMap(styleKeys)), "Styles must have different ids"),
    ),
    keepRecordings: v.boolean(),
    smartSpacing: v.boolean(),
    sounds: v.strictObject({ enabled: v.boolean(), volume: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)) }),
    indicator: v.picklist(INDICATORS),
    audioCapMb: v.picklist(AUDIO_CAPS_MB),
    duckAudio: v.picklist(DUCK_MODES),
    duckSpeakersOnly: v.boolean(),
    duckLevel: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  }),
);
export type DictationPatch = v.InferOutput<typeof DictationPatchSchema>;

/** Every key at its default: what a config with no dictation section loads as. */
export const DEFAULT_DICTATION: DictationConfig = v.parse(DictationConfigSchema, {});
