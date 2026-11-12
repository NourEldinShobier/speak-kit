import * as v from "valibot";

/** Constants the renderer needs and cannot import from the engine package (it holds native modules); engines.test.ts keeps them equal to the engine's. */
export const SPEECH_IDLE_CHOICES = [5, 15, 30, 60, 0] as const;
export const DEVICE_VALUES = ["auto", "gpu", "cpu"] as const;
export const SPOKEN_LANGUAGE_CODES = ["en", "de", "ar", "fr", "es", "it", "pt", "nl", "pl", "tr", "ru", "uk", "lt", "sv", "hi", "ja", "ko", "zh"] as const;

export const SPOKEN_LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  auto: "Detect automatically",
  en: "English",
  de: "German",
  ar: "Arabic",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  ru: "Russian",
  uk: "Ukrainian",
  lt: "Lithuanian",
  sv: "Swedish",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
};

const bool = (d: boolean) => v.fallback(v.boolean(), d);
const short = (n: number) => v.pipe(v.string(), v.maxLength(n));

const Rule = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  layout: v.optional(short(16)),
  app: v.optional(short(80)),
  model: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  language: v.optional(short(8)),
});

const FailedDevice = v.object({ name: short(120), driver: short(60), reason: short(300), at: v.number() });

// A bad entry is dropped, the rest of the list stays.
const dropBad = <T extends v.GenericSchema>(item: T, max: number) =>
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

/** Persisted under `engines` in config.json: every key falls back to its default, which is also how files from before this page existed load. */
export const EnginesConfigSchema = v.object({
  device: v.fallback(v.picklist(DEVICE_VALUES), "auto"),
  idleMinutes: v.fallback(v.picklist(SPEECH_IDLE_CHOICES), 15),
  /** Graphics cards that failed to run speech, with the driver they failed on. */
  failedDevices: dropBad(FailedDevice, 8),
  /** The outcome of timing an integrated card against the CPU, by "<card>|<driver>". */
  timedDevices: v.fallback(v.record(v.string(), v.picklist(["gpu", "cpu"])), {}),
  /** Release the window and the graphics card memory when the window is closed to the tray. */
  releaseOnClose: bool(false),
  autoSwitch: v.fallback(v.object({ enabled: bool(false), rules: dropBad(Rule, 20) }), { enabled: false, rules: [] }),
  /** Newer-model hints the person dismissed. */
  dismissedHints: dropBad(v.pipe(v.string(), v.maxLength(64)), 20),
  /** The person went on without a speech model. */
  skippedModel: bool(false),
  /** When each model was last used, in epoch milliseconds. */
  lastUsed: v.fallback(v.record(v.string(), v.number()), {}),
});
export type EnginesConfig = v.InferOutput<typeof EnginesConfigSchema>;
