import * as v from "valibot";

export const TEXT_DAYS = [7, 30, 90, 365, 0] as const;
export const AUDIO_DAYS = [1, 3, 7, 14, 30] as const;
export const TRASH_DAYS = [7, 30, 90] as const;
/** Most audio kept in total; above it the oldest audio is deleted first. */
export const AUDIO_CAP_BYTES = 5 * 1024 ** 3;
export const TRANSCRIPT_LANGUAGES = ["auto", "en", "de", "ar"] as const;

const days = <T extends readonly number[]>(options: T, fallback: T[number]) => v.fallback(v.picklist(options), fallback);

/** Persisted under `transcripts` in config.json. 0 days for text means keep forever. Files from before transcripts existed load with these defaults. */
export const TranscriptsConfigSchema = v.object({
  textDays: days(TEXT_DAYS, 30),
  keepAudio: v.fallback(v.boolean(), true),
  audioDays: days(AUDIO_DAYS, 7),
  trashDays: days(TRASH_DAYS, 30),
  /** Where "Save as" writes; empty is the Speak Kit folder in Documents. */
  folder: v.fallback(v.pipe(v.string(), v.maxLength(1024)), ""),
  language: v.fallback(v.picklist(TRANSCRIPT_LANGUAGES), "auto"),
});
export type TranscriptsConfig = v.InferOutput<typeof TranscriptsConfigSchema>;

/** What the renderer may change. The folder has its own call (it opens a chooser). */
export const TranscriptsPatchSchema = v.partial(
  v.strictObject({
    textDays: v.picklist(TEXT_DAYS),
    keepAudio: v.boolean(),
    audioDays: v.picklist(AUDIO_DAYS),
    trashDays: v.picklist(TRASH_DAYS),
    language: v.picklist(TRANSCRIPT_LANGUAGES),
  }),
);
export type TranscriptsPatch = v.InferOutput<typeof TranscriptsPatchSchema>;

/** The retention rules the transcripts package applies; "forever" text is null days. The audio period is cut to the text period there. */
export const policyOf = (c: TranscriptsConfig) => ({
  textDays: c.textDays === 0 ? null : c.textDays,
  audioDays: c.audioDays,
  audioCapBytes: AUDIO_CAP_BYTES,
  trashDays: c.trashDays,
  keepAudio: c.keepAudio,
});
