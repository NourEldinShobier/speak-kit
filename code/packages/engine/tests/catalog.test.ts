import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_STT_MODEL, FEATURED_STT_MODELS, MEASUREMENT_SAMPLE, PREFERRED_MODEL, PREFERRED_MODEL_CPU, STT_MODELS, cpuFloorModel, wrongWords } from "../src";

describe("catalog entries", () => {
  it("has unique ids and files, a file name that matches its address, and a full SHA-256", () => {
    expect(new Set(STT_MODELS.map((m) => m.id)).size).toBe(STT_MODELS.length);
    expect(new Set(STT_MODELS.map((m) => m.file)).size).toBe(STT_MODELS.length);
    for (const m of STT_MODELS) {
      expect(m.url.endsWith(`/${m.file}`), m.id).toBe(true);
      expect(m.url.startsWith("https://huggingface.co/"), m.id).toBe(true);
      expect(m.sha256, m.id).toMatch(/^[0-9a-f]{64}$/);
      expect(m.bytes, m.id).toBeGreaterThan(1_000_000);
    }
  });

  it("only uses licences that allow shipping the file to users", () => {
    expect([...new Set(STT_MODELS.map((m) => m.license.name))].sort()).toEqual(["CC BY 4.0", "MIT"]);
  });

  it("keeps the two original models first and the default among them", () => {
    expect(STT_MODELS.slice(0, 2).map((m) => m.id)).toEqual(["large-v3-turbo-q5_0", "parakeet-tdt-0.6b-v3-q4_0"]);
    expect(DEFAULT_STT_MODEL).toBe("large-v3-turbo-q5_0");
  });

  it("was measured for every model, only in languages the model handles", () => {
    for (const m of STT_MODELS) {
      expect(m.measured, m.id).toBeDefined();
      for (const code of Object.keys(m.measured!.wrong)) expect(m.languages, `${m.id} ${code}`).toContain(code);
      for (const code of ["en", "de", "ar"] as const) {
        const w = wrongWords(m, code);
        if (w) expect(w.of, `${m.id} ${code}`).toBe(MEASUREMENT_SAMPLE.words[code]);
      }
    }
  });

  it("offers Whisper in every size and precision of the official repository's multilingual set, Distil-Whisper for English and the Parakeet variants the binding runs", () => {
    const ids = STT_MODELS.map((m) => m.id);
    for (const id of [
      "tiny",
      "base",
      "small",
      "medium",
      "large-v3",
      "large-v3-turbo",
      "tiny-q5_1",
      "base-q5_1",
      "small-q5_1",
      "medium-q5_0",
      "large-v3-q5_0",
      "large-v3-turbo-q8_0",
      "distil-large-v3",
      "parakeet-ultra-q8_0",
    ])
      expect(ids).toContain(id);
    expect(STT_MODELS.find((m) => m.id === "distil-large-v3")).toMatchObject({ languages: ["en"], detects: false });
  });
});

describe("recommendations derived from the measurements", () => {
  it("recommends, with a graphics card, the accurate large model for English and the turbo model for every other language", () => {
    expect(PREFERRED_MODEL).toMatchObject({
      en: "large-v3-q5_0",
      de: "large-v3-turbo-q5_0",
      ar: "large-v3-turbo-q5_0",
      auto: "large-v3-turbo-q5_0",
      fr: "large-v3-turbo-q5_0",
      lt: "large-v3-turbo-q5_0",
    });
  });

  it("recommends, without one, only models quick on the CPU: Parakeet for English and German, nothing for the rest", () => {
    expect(PREFERRED_MODEL_CPU).toEqual({ en: "parakeet-tdt-0.6b-v3-q4_0", de: "parakeet-tdt-0.6b-v3-q4_0" });
    expect(cpuFloorModel(STT_MODELS)?.id).toBe("parakeet-tdt-0.6b-v3-q4_0");
  });

  it("recommends only models that handle the language", () => {
    for (const map of [PREFERRED_MODEL, PREFERRED_MODEL_CPU]) {
      for (const [language, id] of Object.entries(map)) expect(STT_MODELS.find((m) => m.id === id)?.languages, `${language} ${id}`).toContain(language);
    }
  });

  it("lists the default, the recommended models and the floor model as the short list", () => {
    expect([...FEATURED_STT_MODELS].sort()).toEqual(["large-v3-q5_0", "large-v3-turbo-q5_0", "parakeet-tdt-0.6b-v3-q4_0"]);
    expect(FEATURED_STT_MODELS.has(DEFAULT_STT_MODEL)).toBe(true);
  });
});
