import * as v from "valibot";
import { firstClash, type Shortcuts } from "./conflicts";
import { DEFAULT_HOTKEY, DEFAULT_PASTE_LAST, validCancelKey, validHotkey } from "./keys";

export const DICTATION_MODELS = ["large-v3-turbo-q5_0", "parakeet-tdt-0.6b-v3-q4_0"] as const;
export type DictationModelId = (typeof DICTATION_MODELS)[number];
export const DICTATION_LANGUAGES = ["auto", "en", "de", "ar"] as const;
export const RETENTIONS = ["off", "24h", "7d", "30d", "forever"] as const;
export const MAX_REPLACEMENTS = 100;
/** How dictated text leaves the app: put back the old clipboard after pasting, leave the text on it, or only copy. */
export const OUTPUTS = ["restore", "keep", "copy"] as const;
export const PASTE_METHODS = ["ctrl-v", "ctrl-shift-v", "shift-insert", "type", "copy"] as const;
export type PasteMethod = (typeof PASTE_METHODS)[number];
export const MAX_APP_RULES = 50;
export const MAX_EXCLUSIONS = 20;
export const MAX_KEEP_READY_MINUTES = 120;

export const MAX_TERMS = 500;
export const MAX_MODES = 24;

export type Replacement = { from: string; to: string };
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
const Replacement = v.object({ from: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)), to: v.pipe(v.string(), v.maxLength(200)) });
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

const AppRule = v.object({ method: v.picklist(PASTE_METHODS), delayMs: v.fallback(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5000)), 0) });
export type AppRule = v.InferOutput<typeof AppRule>;
const exeName = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.regex(/^[a-z0-9._ -]{1,60}$/));
// A bad rule is dropped, the rest of the table stays; the program name is kept without ".exe".
const appRules = v.fallback(
  v.pipe(
    v.record(v.string(), v.unknown()),
    v.transform((all) => {
      const out: Record<string, AppRule> = {};
      for (const [name, rule] of Object.entries(all)) {
        const key = v.safeParse(exeName, name.replace(/\.exe$/i, ""));
        const parsed = v.safeParse(AppRule, rule);
        if (key.success && parsed.success && Object.keys(out).length < MAX_APP_RULES) out[key.output] = parsed.output;
      }
      return out;
    }),
  ),
  {},
);
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
      const drop = (["raw", "mouse", "second", "pasteLast", "cancel"] as const).find((slot) => clash.includes(slot));
      if (!drop) break;
      out = {
        ...out,
        resetNotice: "clash" as const,
        ...(drop === "raw" && { rawHotkey: "" }),
        ...(drop === "mouse" && { mouseButton: "" as const }),
        ...(drop === "second" && { secondHotkey: "" }),
        ...(drop === "pasteLast" && { pasteLastHotkey: DEFAULT_PASTE_LAST }),
        ...(drop === "cancel" && { cancelKey: "Escape" }),
      };
    }
    return out;
  }),
);
export type DictationConfig = v.InferOutput<typeof DictationConfigSchema>;
export { hotkeySlots };

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

/** Every key at its default: what a config with no dictation section loads as. */
export const DEFAULT_DICTATION: DictationConfig = v.parse(DictationConfigSchema, {});
