import * as v from "valibot";
import { DEFAULT_HOTKEY, validHotkey } from "./keys";

import { SPOKEN_LANGUAGE_CODES } from "../speech-models/config";

export const DICTATION_MODELS = ["large-v3-turbo-q5_0", "parakeet-tdt-0.6b-v3-q4_0"] as const;
/** A catalog model, or one the person added from a file ("custom-" and twelve hex digits of its fingerprint). */
export type DictationModelId = (typeof DICTATION_MODELS)[number] | `custom-${string}`;
const modelId = v.union([
  v.picklist(DICTATION_MODELS),
  v.pipe(
    v.string(),
    v.regex(/^custom-[0-9a-f]{12}$/),
    v.transform((s) => s as `custom-${string}`),
  ),
]);
export const DICTATION_LANGUAGES = ["auto", ...SPOKEN_LANGUAGE_CODES] as const;
export const RETENTIONS = ["off", "24h", "7d", "30d", "forever"] as const;
export const MAX_REPLACEMENTS = 100;

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

/** Persisted under `dictation` in config.json. Off until the person turns it on; every key falls back to its default, which is also how files from before dictation existed load. */
export const DictationConfigSchema = v.object({
  enabled: v.fallback(v.boolean(), false),
  hotkey,
  mode: v.fallback(v.picklist(["hold", "toggle"]), "hold"),
  // An explicit language is the default: automatic detection can mistranscribe close languages, so it is something the person chooses.
  language: v.fallback(v.picklist(DICTATION_LANGUAGES), "en"),
  model: v.fallback(modelId, DICTATION_MODELS[0]),
  retention: v.fallback(v.picklist(RETENTIONS), "7d"),
  replacements,
});
export type DictationConfig = v.InferOutput<typeof DictationConfigSchema>;

/** What the renderer may change; `enabled` has its own call because turning dictation on starts the hook and the microphone window. */
export const DictationPatchSchema = v.partial(
  v.strictObject({
    hotkey: v.pipe(v.string(), v.check(validHotkey)),
    mode: v.picklist(["hold", "toggle"]),
    language: v.picklist(DICTATION_LANGUAGES),
    model: modelId,
    retention: v.picklist(RETENTIONS),
    replacements: v.pipe(v.array(Replacement), v.maxLength(MAX_REPLACEMENTS)),
  }),
);
export type DictationPatch = v.InferOutput<typeof DictationPatchSchema>;
