import * as v from "valibot";
import { normalizeSite } from "@speakkit/dictation";
import { firstClash, type Shortcuts } from "./conflicts";
import { appRules, AppRule, exeName, MAX_APP_RULES } from "./app-rules";
export { MAX_APP_RULES, PASTE_METHODS, type AppRule, type PasteMethod } from "./app-rules";
import { AUDIO_CAPS_MB, INDICATORS, SoundsSchema } from "./feedback";
export { AUDIO_CAPS_MB, INDICATORS, type Indicator } from "./feedback";
import { DEFAULT_HOTKEY, DEFAULT_PASTE_LAST, validCancelKey, validHotkey } from "./keys";

import { SPOKEN_LANGUAGE_CODES } from "../speech-models/config";

export const DICTATION_MODELS = ["large-v3-turbo-q5_0", "parakeet-tdt-0.6b-v3-q4_0"] as const;
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
export const DICTATION_LANGUAGES = ["auto", ...SPOKEN_LANGUAGE_CODES] as const;
export const DUCK_MODES = ["nothing", "mute", "lower", "pause"] as const;
export const RETENTIONS = ["off", "24h", "7d", "30d", "forever"] as const;
export const MAX_REPLACEMENTS = 100;
/** How dictated text leaves the app: put back the old clipboard after pasting, leave the text on it, or only copy. */
export const OUTPUTS = ["restore", "keep", "copy"] as const;
export const MAX_EXCLUSIONS = 20;
export const MAX_KEEP_READY_MINUTES = 120;

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
const Replacement = v.object({ from: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)), to: v.pipe(v.string(), v.maxLength(200)), matchCase: v.optional(v.boolean()) });
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
  /** Website host names; a name that is not one is dropped, a repeated one kept once. Modes saved before sites existed have none. */
  sites: v.fallback(
    v.pipe(
      v.array(v.pipe(v.string(), v.transform(normalizeSite))),
      v.transform((l) => [...new Set(l.filter(Boolean))].slice(0, 50)),
    ),
    [],
  ),
  insertMode: v.picklist(["paste", "type", "copy"]),
  capitals: v.picklist(["keep", "sentence", "lower"]),
  end: v.picklist(["keep", "no-full-stop"]),
  rewrite: v.boolean(),
  /** Replacements only for this mode; a file from before they existed loads with none. */
  replacements,
};
type ModeOut = v.InferOutput<ReturnType<typeof v.object<typeof modeEntries & { terms: typeof termList }>>>;
// The built-in default mode lists no apps and keeps its name; no other mode may take that name.
const nameFree = (m: ModeOut): boolean => m.id === DEFAULT_ID || lower(m.name) !== "default";
const settleDefault = (m: ModeOut): ModeOut => (m.id === DEFAULT_ID ? { ...m, name: "Default", apps: [], sites: [] } : m);
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
const hotkey = v.fallback(v.pipe(v.string(), v.check(validHotkey)), DEFAULT_HOTKEY);
/** "" is unset. */
const optionalHotkey = (fallback: string) => v.fallback(v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]), fallback);
export const MODES = ["hold", "hold-only", "toggle", "double-tap", "tap-or-hold"] as const;
export const HOLD_TIMES = [150, 200, 300, 400, 500, 750, 1000] as const;
export const PAUSE_MODES = ["off", "allow", "block"] as const;
/** Pausing by foreground program, and in full-screen programs. Experimental. */
const PauseRules = v.object({
  mode: v.fallback(v.picklist(PAUSE_MODES), "off"),
  apps: v.fallback(v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80))), v.maxLength(50)), []),
  fullscreen: v.fallback(v.boolean(), false),
});
export type PauseRules = v.InferOutput<typeof PauseRules>;
const MOUSE_PICK = ["", "Mouse2", "Mouse3", "Mouse4", "Mouse5"] as const;

const exclusions = v.fallback(v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60))), v.maxLength(MAX_EXCLUSIONS)), []);

/** Persisted under `dictation` in config.json. Off until the person turns it on; every key falls back to its default, which is also how files from before dictation existed load. */
const CORE_KEYS = {
  enabled: v.fallback(v.boolean(), false),
  hotkey,
  mode: v.fallback(v.picklist(MODES), "hold"),
  holdMs: v.fallback(v.picklist(HOLD_TIMES), 300),
  secondHotkey: optionalHotkey(""),
  mouseButton: v.fallback(v.picklist(MOUSE_PICK), ""),
  rawHotkey: optionalHotkey(""),
  pasteLastHotkey: optionalHotkey(DEFAULT_PASTE_LAST),
  cancelKey: v.fallback(v.pipe(v.string(), v.check(validCancelKey)), "Escape"),
  /** Hold mode only: the keys also reach the program that listens for them (push-to-talk in a chat app). */
  shareHotkey: v.fallback(v.boolean(), false),
  pauseRules: v.fallback(PauseRules, { mode: "off", apps: [], fullscreen: false }),
  /** Set when a saved shortcut was refused at load and replaced: the page says so once. */
  resetNotice: v.fallback(v.optional(v.picklist(["left-click", "clash"])), undefined),
  // An explicit language is the default: automatic detection can mistranscribe close languages, so it is something the person chooses.
  language: v.fallback(v.picklist(DICTATION_LANGUAGES), "en"),
  model: v.fallback(modelId, DICTATION_MODELS[0]),
  retention: v.fallback(v.picklist(RETENTIONS), "7d"),
  replacements,
  /** Device id of the chosen microphone; empty means the system default, never a virtual input. */
  microphone: v.fallback(v.pipe(v.string(), v.maxLength(300)), ""),
  micExclusions: exclusions,
  avoidBluetooth: v.fallback(v.boolean(), true),
  /** Keep the microphone open between recordings, for the audio before the key press. */
  keepReady: v.fallback(v.boolean(), false),
  /** Close an idle open microphone after this many minutes; 0 keeps it open while dictation is on. */
  keepReadyMinutes: v.fallback(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_KEEP_READY_MINUTES)), 0),
  /** Add a little silence after the speech for models that need it to end the last sentence. */
  sentencePause: v.fallback(v.boolean(), true),
  output: v.fallback(v.picklist(OUTPUTS), "restore"),
  returnToApp: v.fallback(v.boolean(), true),
  appRules,
  /** Stop the computer from sleeping while a recording runs. */
  blockSleep: v.fallback(v.boolean(), true),
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
  keepRecordings: bool(false),
  /** Add a space before the text when the character before the caret is a letter, digit or closing punctuation. */
  smartSpacing: bool(false),
  /** Cleans the text of the focused field with the dictation rules and puts it back; "" is off. */
  transformHotkey: optionalHotkey(""),
  /** Short tones when a recording starts, stops and fails. Off until the person turns them on; volume is 0 to 100. */
  sounds: v.fallback(SoundsSchema, { enabled: false, volume: 50 }),
  indicator: v.fallback(v.picklist(INDICATORS), "bottom"),
  audioCapMb: v.fallback(v.picklist(AUDIO_CAPS_MB), 512),
  /** What happens to other audio while a recording runs. */
  duckAudio: v.fallback(v.picklist(DUCK_MODES), "nothing"),
  /** Leave other audio alone when the sound goes to headphones, which the microphone cannot hear. */
  duckSpeakersOnly: bool(true),
};
const MouseOne = /(^|\+)Mouse1(\+|$)/;
export const hotkeySlots = (c: { hotkey: string; secondHotkey: string; mouseButton: string; rawHotkey: string; pasteLastHotkey: string; transformHotkey: string; cancelKey: string }): Shortcuts => ({
  dictation: c.hotkey,
  second: c.secondHotkey,
  mouse: c.mouseButton,
  raw: c.rawHotkey,
  pasteLast: c.pasteLastHotkey,
  transform: c.transformHotkey,
  cancel: c.cancelKey,
});
export const DictationConfigSchema = v.pipe(
  // A saved left button as the shortcut would swallow every click: it goes back to the default and the page says why.
  v.pipe(
    v.unknown(),
    v.transform((raw) => {
      const r = raw as Record<string, unknown> | null;
      if (r && typeof r === "object" && [r.hotkey, r.secondHotkey, r.rawHotkey, r.mouseButton].some((x) => typeof x === "string" && MouseOne.test(x))) {
        return { ...r, hotkey: typeof r.hotkey === "string" && MouseOne.test(r.hotkey) ? DEFAULT_HOTKEY : r.hotkey, secondHotkey: "", rawHotkey: "", mouseButton: "", resetNotice: "left-click" };
      }
      return raw;
    }),
  ),
  v.object(CORE_KEYS),
  // Two shortcuts that share a key cannot both work: the optional one that clashes is cleared.
  v.transform((c) => {
    let out = c;
    for (let i = 0; i < 6; i++) {
      const clash = firstClash(hotkeySlots(out));
      if (!clash) break;
      const drop = (["raw", "mouse", "second", "pasteLast", "transform", "cancel"] as const).find((slot) => clash.includes(slot));
      if (!drop) break;
      out = {
        ...out,
        resetNotice: "clash" as const,
        ...(drop === "raw" && { rawHotkey: "" }),
        ...(drop === "mouse" && { mouseButton: "" as const }),
        ...(drop === "second" && { secondHotkey: "" }),
        ...(drop === "pasteLast" && { pasteLastHotkey: DEFAULT_PASTE_LAST }),
        ...(drop === "transform" && { transformHotkey: "" }),
        ...(drop === "cancel" && { cancelKey: "Escape" }),
      };
    }
    return out;
  }),
);
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
    mode: v.picklist(MODES),
    holdMs: v.picklist(HOLD_TIMES),
    secondHotkey: v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]),
    mouseButton: v.picklist(MOUSE_PICK),
    rawHotkey: v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]),
    pasteLastHotkey: v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]),
    cancelKey: v.pipe(v.string(), v.check(validCancelKey)),
    shareHotkey: v.boolean(),
    pauseRules: PauseRules,
    language: v.picklist(DICTATION_LANGUAGES),
    model: modelId,
    retention: v.picklist(RETENTIONS),
    replacements: v.pipe(v.array(Replacement), v.maxLength(MAX_REPLACEMENTS)),
    microphone: v.pipe(v.string(), v.maxLength(300)),
    micExclusions: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60))), v.maxLength(MAX_EXCLUSIONS)),
    avoidBluetooth: v.boolean(),
    keepReady: v.boolean(),
    keepReadyMinutes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_KEEP_READY_MINUTES)),
    sentencePause: v.boolean(),
    output: v.picklist(OUTPUTS),
    returnToApp: v.boolean(),
    appRules: v.pipe(
      v.record(exeName, AppRule),
      v.check((r) => Object.keys(r).length <= MAX_APP_RULES),
    ),
    blockSleep: v.boolean(),
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
      lowercase: v.boolean(),
      stripFinalStop: v.boolean(),
    }),
    modes: modeList,
    rewrite: v.strictObject({ enabled: v.boolean(), deadlineMs: v.pipe(v.number(), v.integer(), v.minValue(1000), v.maxValue(15_000)) }),
    keepRecordings: v.boolean(),
    smartSpacing: v.boolean(),
    transformHotkey: v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]),
    sounds: v.strictObject({ enabled: v.boolean(), volume: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)) }),
    indicator: v.picklist(INDICATORS),
    audioCapMb: v.picklist(AUDIO_CAPS_MB),
    duckAudio: v.picklist(DUCK_MODES),
    duckSpeakersOnly: v.boolean(),
  }),
);
export type DictationPatch = v.InferOutput<typeof DictationPatchSchema>;

/** Every key at its default: what a config with no dictation section loads as. */
export const DEFAULT_DICTATION: DictationConfig = v.parse(DictationConfigSchema, {});
