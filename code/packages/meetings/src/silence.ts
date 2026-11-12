import { tokenize } from "@speakkit/transcripts";

/** Lines speech models invent on silence or music: closing credits and thanks lines, by language. Matched as the whole output, ignoring case and punctuation. */
export const CREDIT_LINES: Readonly<Record<string, readonly string[]>> = {
  en: [
    "thanks for watching",
    "thank you for watching",
    "thank you",
    "thanks",
    "please subscribe",
    "subtitles by the amara.org community",
    "subtitles by amara.org",
    "like and subscribe",
    "bye",
    "you",
  ],
  de: ["untertitel der amara.org-community", "untertitel im auftrag des zdf für funk, 2017", "vielen dank fürs zuschauen", "danke fürs zuschauen", "tschüss"],
  ar: ["اشتركوا في القناة", "شكرا للمشاهدة", "ترجمة نانسي قنقر"],
};

const norm = (s: string) => tokenize(s).join(" ");

/** Whether the whole output is a known invented line, in this language or (for "auto") in any. */
export function isCredit(text: string, language = "auto"): boolean {
  const t = norm(text);
  if (!t) return false;
  const lists = language in CREDIT_LINES ? [CREDIT_LINES[language]!] : Object.values(CREDIT_LINES);
  return lists.some((l) => l.some((c) => norm(c) === t));
}

/** Whether the output only repeats words from the vocabulary hints given to the model (it echoed the prompt instead of hearing anything). */
export function repeatsHints(text: string, hints: readonly string[]): boolean {
  const words = tokenize(text);
  if (!words.length || !hints.length) return false;
  const known = new Set(hints.flatMap((h) => tokenize(h)));
  return words.every((w) => known.has(w));
}

/** The output of one clip, or "" when it is an invented credit line or an echo of the prompt. */
export function cleanOutput(text: string, o: { language?: string; hints?: readonly string[] } = {}): string {
  const t = text.trim();
  if (!t || isCredit(t, o.language) || repeatsHints(t, o.hints ?? [])) return "";
  return t;
}

export interface GateOptions {
  /** Speech probability from which a frame counts as speech. */
  threshold?: number;
  /** Speech shorter than this is noise. */
  minSpeechMs?: number;
}

export const GATE_DEFAULTS = { threshold: 0.4, minSpeechMs: 160 } as const;

/**
 * Whether a clip holds speech, from per-frame speech probabilities of a detector: at least `minSpeechMs` in one run above `threshold`.
 * A clip with none is dropped quietly, not sent to the model that would invent text for it.
 */
export function hasSpeech(probabilities: readonly number[], frameMs: number, o: GateOptions = {}): boolean {
  const threshold = o.threshold ?? GATE_DEFAULTS.threshold;
  const need = Math.max(1, Math.ceil((o.minSpeechMs ?? GATE_DEFAULTS.minSpeechMs) / frameMs));
  let run = 0;
  for (const p of probabilities) {
    run = p >= threshold ? run + 1 : 0;
    if (run >= need) return true;
  }
  return false;
}

/** Root mean square of each frame of `ms` milliseconds (16 kHz audio), 0 to 1. */
export function frameLevels(pcm: Int16Array, ms: number, rate = 16_000): number[] {
  const size = Math.max(1, Math.round((rate * ms) / 1000));
  const out: number[] = [];
  for (let s = 0; s < pcm.length; s += size) {
    const end = Math.min(pcm.length, s + size);
    let sum = 0;
    for (let i = s; i < end; i++) sum += (pcm[i]! / 32768) ** 2;
    out.push(Math.sqrt(sum / (end - s)));
  }
  return out;
}

/** A level to a probability for the energy fallback: 0 below the noise floor, 1 from clear speech. */
const toProbability = (level: number) => Math.min(1, Math.max(0, (level - 0.004) / 0.02));

/** The detector used when no model-based one is available: loudness per 32 ms frame. */
export function energyHasSpeech(pcm: Int16Array, o: GateOptions = {}): boolean {
  return hasSpeech(frameLevels(pcm, 32).map(toProbability), 32, o);
}

export type MicState = "ok" | "silent";

export interface MicGuardOptions {
  /** How long the microphone may give nothing while the other side speaks before the warning. */
  silentAfterMs?: number;
  /** Level (0 to 1) under which the microphone counts as silent. */
  floor?: number;
}

/**
 * The silent-microphone guard: a microphone that gives nothing for a while during a call while the other side is heard is most often muted in the OS or
 * the wrong device. The state flips to "silent" once (the person sees one notice) and back to "ok" when sound returns.
 */
export class MicGuard {
  readonly #silentAfter: number;
  readonly #floor: number;
  #quietSince: number | undefined;
  #state: MicState = "ok";

  constructor(o: MicGuardOptions = {}) {
    this.#silentAfter = o.silentAfterMs ?? 20_000;
    this.#floor = o.floor ?? 0.002;
  }

  get state(): MicState {
    return this.#state;
  }

  /** Feed one reading of both tracks; returns the new state when it changed. */
  feed(at: number, mic: number, them: number): MicState | undefined {
    if (mic >= this.#floor) {
      this.#quietSince = undefined;
      return this.#set("ok");
    }
    // Nothing from the other side either: a quiet room, not a dead microphone.
    if (them < this.#floor) {
      this.#quietSince = undefined;
      return undefined;
    }
    this.#quietSince ??= at;
    return at - this.#quietSince >= this.#silentAfter ? this.#set("silent") : undefined;
  }

  #set(s: MicState): MicState | undefined {
    if (s === this.#state) return undefined;
    this.#state = s;
    return s;
  }
}
