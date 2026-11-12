import * as v from "valibot";
import { checkAccelerator, normalize } from "../shortcuts";

export const CALL_POLICY_CHOICES = ["ask", "always", "never"] as const;
export const RECORD_SOURCES = ["call-app", "system"] as const;
/** Hours the audio of a meeting is kept after it ends. */
export const AUDIO_HOURS = [1, 6, 24, 72, 168] as const;
export const MEETING_TEXT_DAYS = [7, 30, 90, 365, 0] as const;
export const MEETING_TRASH_DAYS = [7, 30, 90] as const;
export const MEETING_DEFAULT_FOLDER_NAME = "Meetings";

const pick = <T extends readonly (string | number)[]>(options: T, fallback: T[number]) => v.fallback(v.picklist(options), fallback);
const device = v.fallback(v.pipe(v.string(), v.maxLength(256)), "");

/** A call app the person added: by program name, by a full meeting link, or both. */
export const AddedAppSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  exe: v.optional(v.pipe(v.string(), v.maxLength(120))),
  link: v.optional(v.pipe(v.string(), v.maxLength(300))),
});
export type AddedApp = v.InferOutput<typeof AddedAppSchema>;

const Position = v.object({ x: v.pipe(v.number(), v.finite()), y: v.pipe(v.number(), v.finite()) });

/** Persisted under `meetings` in config.json. Files from before meetings existed load with these defaults. */
export const MeetingsConfigSchema = v.object({
  /** "Offer to record calls": the feature switch. Off hides the Meetings tab and offers nothing; recordings are kept. */
  enabled: v.fallback(v.boolean(), true),
  stopWhenEnds: v.fallback(v.boolean(), true),
  /** Optional start and stop shortcut; empty is not set. */
  shortcut: v.fallback(
    v.pipe(
      v.string(),
      v.check((a) => a === "" || checkAccelerator(a) === null),
      v.transform((a) => (a === "" ? "" : normalize(a)!)),
    ),
    "",
  ),
  policies: v.fallback(v.record(v.pipe(v.string(), v.maxLength(64)), pick(CALL_POLICY_CHOICES, "ask")), {}),
  apps: v.fallback(v.pipe(v.array(AddedAppSchema), v.maxLength(40)), []),
  recordSource: pick(RECORD_SOURCES, "call-app"),
  /** "automatic" or an output device id. */
  output: v.fallback(v.pipe(v.string(), v.maxLength(256)), "automatic"),
  /** "dictation", "call-app" or an input device id. */
  mic: v.fallback(v.pipe(v.string(), v.maxLength(256)), "dictation"),
  /** The summary pass is opt-in: text leaves the computer for OpenAI only after the person turns this on. */
  summary: v.fallback(v.boolean(), false),
  audioHours: pick(AUDIO_HOURS, 24),
  textDays: pick(MEETING_TEXT_DAYS, 30),
  trashDays: pick(MEETING_TRASH_DAYS, 30),
  /** Where "Show in folder" files go; empty is the Speak Kit folder in Documents. */
  folder: v.fallback(v.pipe(v.string(), v.maxLength(1024)), ""),
  /** The capsule's corner on each monitor, by monitor key. */
  positions: v.fallback(v.pipe(v.record(v.pipe(v.string(), v.maxLength(80)), Position), v.maxEntries(16)), {}),
  inputDevice: device,
});
export type MeetingsConfig = v.InferOutput<typeof MeetingsConfigSchema>;

/** What the renderer may change; apps and the folder have their own calls. */
export const MeetingsPatchSchema = v.partial(
  v.strictObject({
    enabled: v.boolean(),
    stopWhenEnds: v.boolean(),
    shortcut: v.pipe(v.string(), v.maxLength(60)),
    recordSource: v.picklist(RECORD_SOURCES),
    output: v.pipe(v.string(), v.maxLength(256)),
    mic: v.pipe(v.string(), v.maxLength(256)),
    summary: v.boolean(),
    audioHours: v.picklist(AUDIO_HOURS),
    textDays: v.picklist(MEETING_TEXT_DAYS),
    trashDays: v.picklist(MEETING_TRASH_DAYS),
  }),
);
export type MeetingsPatch = v.InferOutput<typeof MeetingsPatchSchema>;

/** The retention the meetings package applies. */
export const retentionOf = (c: MeetingsConfig) => ({ audioHours: c.audioHours, textDays: c.textDays, trashDays: c.trashDays });
