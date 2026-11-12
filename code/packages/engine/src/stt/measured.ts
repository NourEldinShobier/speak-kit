import type { SpokenLanguage } from "./languages";

/** What running one model on the test recordings showed. */
export interface Measured {
  /** Word errors over the words of the recordings, per language. Only languages the model handles. */
  wrong: Partial<Record<SpokenLanguage, { wrong: number; of: number }>>;
  /** Milliseconds from the end of a recording to the text (median of repeated runs): a 4.6 s and a 15.6 s recording, on a graphics card and on the CPU alone. */
  ms: Record<"gpu" | "cpu", { short: number; long: number }>;
}

/** What the figures rest on; shown next to them. They are measured on a small sample on one computer, not published benchmarks. */
export const MEASUREMENT_SAMPLE = {
  recordings: { en: 4, de: 4, ar: 4 },
  words: { en: 79, de: 90, ar: 64 },
  machine: "NVIDIA GeForce RTX 4080 Laptop GPU and an Intel Core i9-13950HX processor (8 speech threads)",
} as const;

export const MEASURED = {
  "tiny-q5_1": { wrong: { en: { wrong: 18, of: 79 }, de: { wrong: 24, of: 90 }, ar: { wrong: 37, of: 64 } }, ms: { gpu: { short: 38, long: 96 }, cpu: { short: 1891, long: 2181 } } },
  tiny: { wrong: { en: { wrong: 17, of: 79 }, de: { wrong: 22, of: 90 }, ar: { wrong: 40, of: 64 } }, ms: { gpu: { short: 111, long: 99 }, cpu: { short: 2095, long: 2392 } } },
  "base-q5_1": { wrong: { en: { wrong: 16, of: 79 }, de: { wrong: 13, of: 90 }, ar: { wrong: 29, of: 64 } }, ms: { gpu: { short: 55, long: 114 }, cpu: { short: 4274, long: 4726 } } },
  base: { wrong: { en: { wrong: 16, of: 79 }, de: { wrong: 15, of: 90 }, ar: { wrong: 30, of: 64 } }, ms: { gpu: { short: 53, long: 125 }, cpu: { short: 5138, long: 5557 } } },
  "small-q5_1": { wrong: { en: { wrong: 15, of: 79 }, de: { wrong: 4, of: 90 }, ar: { wrong: 12, of: 64 } }, ms: { gpu: { short: 97, long: 203 }, cpu: { short: 16327, long: 17195 } } },
  small: { wrong: { en: { wrong: 13, of: 79 }, de: { wrong: 4, of: 90 }, ar: { wrong: 11, of: 64 } }, ms: { gpu: { short: 101, long: 224 }, cpu: { short: 20131, long: 21344 } } },
  "medium-q5_0": { wrong: { en: { wrong: 12, of: 79 }, de: { wrong: 3, of: 90 }, ar: { wrong: 5, of: 64 } }, ms: { gpu: { short: 207, long: 388 }, cpu: { short: 51232, long: 53161 } } },
  medium: { wrong: { en: { wrong: 12, of: 79 }, de: { wrong: 3, of: 90 }, ar: { wrong: 5, of: 64 } }, ms: { gpu: { short: 246, long: 479 }, cpu: { short: 66237, long: 69303 } } },
  "large-v3-q5_0": { wrong: { en: { wrong: 7, of: 79 }, de: { wrong: 1, of: 90 }, ar: { wrong: 5, of: 64 } }, ms: { gpu: { short: 341, long: 615 }, cpu: { short: 100302, long: 103933 } } },
  "large-v3": { wrong: { en: { wrong: 8, of: 79 }, de: { wrong: 1, of: 90 }, ar: { wrong: 5, of: 64 } }, ms: { gpu: { short: 396, long: 733 }, cpu: { short: 131113, long: 137070 } } },
  "large-v3-turbo-q5_0": { wrong: { en: { wrong: 13, of: 79 }, de: { wrong: 1, of: 90 }, ar: { wrong: 3, of: 64 } }, ms: { gpu: { short: 210, long: 281 }, cpu: { short: 88824, long: 87047 } } },
  "large-v3-turbo-q8_0": { wrong: { en: { wrong: 12, of: 79 }, de: { wrong: 1, of: 90 }, ar: { wrong: 3, of: 64 } }, ms: { gpu: { short: 209, long: 280 }, cpu: { short: 35132, long: 35645 } } },
  "large-v3-turbo": { wrong: { en: { wrong: 12, of: 79 }, de: { wrong: 1, of: 90 }, ar: { wrong: 3, of: 64 } }, ms: { gpu: { short: 205, long: 296 }, cpu: { short: 114492, long: 116055 } } },
  "distil-large-v3": { wrong: { en: { wrong: 13, of: 79 } }, ms: { gpu: { short: 212, long: 267 }, cpu: { short: 113957, long: 110914 } } },
  "parakeet-tdt-0.6b-v3-q4_0": { wrong: { en: { wrong: 10, of: 79 }, de: { wrong: 2, of: 90 } }, ms: { gpu: { short: 45, long: 99 }, cpu: { short: 1067, long: 3989 } } },
  "parakeet-tdt-0.6b-v3-q8_0": { wrong: { en: { wrong: 11, of: 79 }, de: { wrong: 2, of: 90 } }, ms: { gpu: { short: 50, long: 112 }, cpu: { short: 710, long: 2679 } } },
  "parakeet-ultra-q8_0": { wrong: { en: { wrong: 10, of: 79 }, de: { wrong: 2, of: 90 } }, ms: { gpu: { short: 42, long: 90 }, cpu: { short: 661, long: 2720 } } },
} as const satisfies Record<string, Measured>;
