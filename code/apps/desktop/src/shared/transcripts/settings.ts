import * as v from "valibot";

export const TRANSCRIPT_LANGUAGES = ["auto", "en", "de", "ar"] as const;

/** Persisted under `transcripts` in config.json. Keys an earlier version stored (retention, Trash, folder) are ignored. */
export const TranscriptsConfigSchema = v.object({
  language: v.fallback(v.picklist(TRANSCRIPT_LANGUAGES), "auto"),
  /** Notes are opt-in: the text of a finished transcript leaves the computer for OpenAI only after the person turns this on. */
  notes: v.fallback(v.boolean(), false),
});
export type TranscriptsConfig = v.InferOutput<typeof TranscriptsConfigSchema>;

/** What the renderer may change. */
export const TranscriptsPatchSchema = v.partial(
  v.strictObject({
    language: v.picklist(TRANSCRIPT_LANGUAGES),
    notes: v.boolean(),
  }),
);
export type TranscriptsPatch = v.InferOutput<typeof TranscriptsPatchSchema>;
