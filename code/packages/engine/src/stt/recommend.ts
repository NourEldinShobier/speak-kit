import type { SttModel } from "./catalog";
import { LANGUAGES, STT_LANGUAGE_CODES, type SpokenLanguage, type SttLanguage } from "./languages";

/** Lengths of the two timing recordings, in seconds. */
export const TIMING_CLIP_SECONDS = { short: 4.6, long: 15.6 } as const;

/** A dictation counts as quick when ten seconds of speech turn into text within this many seconds. */
export const QUICK_SECONDS = { gpu: 1.5, cpu: 3 } as const;

/**
 * Two models count as equally accurate when their error rates differ by no more than one standard error of the best one's rate on this many words:
 * the test recordings are a small sample, so a smaller gap than that is noise, and the smaller download wins.
 */
const standardError = (rate: number, words: number): number => Math.sqrt((rate * (1 - rate)) / words);

/** A model that gets more than this share of a language's words wrong is not recommended for it, however small or quick it is. */
export const USABLE_MAX_WER = 0.3;

export type Device = "gpu" | "cpu";

export interface WrongWords {
  wrong: number;
  of: number;
}

/** Word errors of one language on the test recordings, or undefined when the model was not run on it. */
export const wrongWords = (m: Pick<SttModel, "measured">, language: SttLanguage): WrongWords | undefined => (language === "auto" ? undefined : m.measured?.wrong[language]);

const rate = (w: WrongWords): number => w.wrong / w.of;

/** Seconds from the end of a recording to the text for ten seconds of speech, interpolated between the two timing recordings. */
export function tenSecondSeconds(m: Pick<SttModel, "measured">, device: Device): number | undefined {
  const ms = m.measured?.ms[device];
  if (!ms) return undefined;
  const { short, long } = TIMING_CLIP_SECONDS;
  const at10 = ms.short + ((ms.long - ms.short) * (10 - short)) / (long - short);
  return Math.round(at10 / 100) / 10;
}

/** The model turns ten seconds of speech into text fast enough on this kind of computer. */
export const quickOn = (m: Pick<SttModel, "measured">, device: Device): boolean => {
  const s = tenSecondSeconds(m, device);
  return s !== undefined && s <= QUICK_SECONDS[device];
};

const measuredLanguages = (m: SttModel): SpokenLanguage[] => LANGUAGES.map((l) => l.code).filter((c) => m.measured?.wrong[c]);

/** The error rate used to rank a model for a language: its own measurement, or for a language that was not run the average of the languages that were. */
function score(m: SttModel, language: SttLanguage): { rate: number; words: number } | undefined {
  const own = wrongWords(m, language);
  if (own) return { rate: rate(own), words: own.of };
  const langs = measuredLanguages(m);
  if (langs.length === 0) return undefined;
  const all = langs.map((c) => m.measured!.wrong[c]!);
  return { rate: all.reduce((sum, w) => sum + rate(w), 0) / all.length, words: all.reduce((sum, w) => sum + w.of, 0) };
}

/** The model for one language on one kind of computer: of the quick models that handle it, the smallest download among those as accurate as the best (within one standard error) and not too inaccurate to use. */
export function recommendFor(models: readonly SttModel[], language: SttLanguage, device: Device): SttModel | undefined {
  const fits = models.filter((m) => m.origin === "builtin" && m.languages.includes(language) && (language !== "auto" || m.detects) && quickOn(m, device));
  const scored = fits.flatMap((m) => {
    const sc = score(m, language);
    return sc && sc.rate <= USABLE_MAX_WER ? [{ m, ...sc }] : [];
  });
  const best = scored.sort((a, b) => a.rate - b.rate)[0];
  if (!best) return undefined;
  const limit = best.rate + standardError(best.rate, best.words);
  return scored.filter((x) => x.rate <= limit).sort((a, b) => a.m.bytes - b.m.bytes)[0]!.m;
}

/** The model for a language when none is quick on this kind of computer: the fastest one that is still accurate enough to use, so the person gets a model that works and the screens show how long it takes. */
function fastestUsable(models: readonly SttModel[], language: SttLanguage, device: Device): SttModel | undefined {
  const usable = models.flatMap((m) => {
    const seconds = tenSecondSeconds(m, device);
    const sc = score(m, language);
    return m.origin === "builtin" && m.languages.includes(language) && (language !== "auto" || m.detects) && seconds !== undefined && sc && sc.rate <= USABLE_MAX_WER ? [{ m, seconds }] : [];
  });
  return usable.sort((a, b) => a.seconds - b.seconds)[0]?.m;
}

/** Language code to model id for every language some model can handle: the quick recommendation, else the fastest usable model. The input of the language table. */
export function recommendedPreference(models: readonly SttModel[], device: Device): Record<string, string> {
  const out: Record<string, string> = {};
  for (const language of STT_LANGUAGE_CODES) {
    const pick = recommendFor(models, language, device) ?? fastestUsable(models, language, device);
    if (pick) out[language] = pick.id;
  }
  return out;
}

/** The model for a computer without a graphics card: what the recommendation for English is when only models quick enough on the CPU count. */
export const cpuFloorModel = (models: readonly SttModel[]): SttModel | undefined => recommendFor(models, "en", "cpu");
