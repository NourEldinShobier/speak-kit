import * as v from "valibot";
import { DEFAULT_HOTKEY, validHotkey } from "./keys";

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

export type Replacement = { from: string; to: string };
const Replacement = v.object({ from: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)), to: v.pipe(v.string(), v.maxLength(200)) });
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
export const DictationConfigSchema = v.object({
  enabled: v.fallback(v.boolean(), false),
  hotkey,
  mode: v.fallback(v.picklist(["hold", "toggle"]), "hold"),
  language: v.fallback(v.picklist(DICTATION_LANGUAGES), "auto"),
  model: v.fallback(v.picklist(DICTATION_MODELS), DICTATION_MODELS[0]),
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
  }),
);
export type DictationPatch = v.InferOutput<typeof DictationPatchSchema>;

/** Every key at its default: what a config with no dictation section loads as. */
export const DEFAULT_DICTATION: DictationConfig = v.parse(DictationConfigSchema, {});
