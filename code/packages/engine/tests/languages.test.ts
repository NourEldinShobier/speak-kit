import { describe, expect, it } from "vite-plus/test";
import { LANGUAGES, STT_LANGUAGE_CODES, isSttLanguage, languageLabel, languageTable, resolveLanguage } from "../src";

const whisper = { id: "large-v3-turbo-q5_0", languages: STT_LANGUAGE_CODES, detects: true };
const parakeet = { id: "parakeet-tdt-0.6b-v3-q4_0", languages: ["en", "de"] as const, detects: false };
const facts = [whisper, parakeet];
const PREFERRED_MODEL = { en: parakeet.id };

describe("language table", () => {
  it("has exactly one recommended model for every language it lists", () => {
    const rows = languageTable(facts, PREFERRED_MODEL);
    const codes = rows.map((r) => r.language);
    expect(new Set(codes).size).toBe(codes.length);
    for (const r of rows) expect(facts.find((m) => m.id === r.recommended)!.languages).toContain(r.language);
  });

  it("lists every code the engine accepts", () => {
    const rows = languageTable(facts, PREFERRED_MODEL);
    expect(rows.map((r) => r.language)).toEqual([...STT_LANGUAGE_CODES]);
    expect(STT_LANGUAGE_CODES).toHaveLength(LANGUAGES.length + 1);
  });

  it("recommends the fast model for English, the accurate one for German, and lists the other as also working", () => {
    const rows = languageTable(facts, PREFERRED_MODEL);
    expect(rows.find((r) => r.language === "en")).toEqual({ language: "en", recommended: "parakeet-tdt-0.6b-v3-q4_0", alsoWorks: ["large-v3-turbo-q5_0"] });
    expect(rows.find((r) => r.language === "de")).toEqual({ language: "de", recommended: "large-v3-turbo-q5_0", alsoWorks: ["parakeet-tdt-0.6b-v3-q4_0"] });
    expect(rows.find((r) => r.language === "ar")).toEqual({ language: "ar", recommended: "large-v3-turbo-q5_0", alsoWorks: [] });
  });

  it("offers automatic detection only through a model that detects", () => {
    expect(languageTable(facts, PREFERRED_MODEL).find((r) => r.language === "auto")).toEqual({ language: "auto", recommended: "large-v3-turbo-q5_0", alsoWorks: [] });
    expect(languageTable([parakeet], {}).map((r) => r.language)).toEqual(["en", "de"]);
  });

  it("falls back to the first fitting model when the preferred one does not handle the language", () => {
    expect(languageTable(facts, { ar: "parakeet-tdt-0.6b-v3-q4_0" }).find((r) => r.language === "ar")?.recommended).toBe("large-v3-turbo-q5_0");
  });

  it("includes Lithuanian, which was requested, on the multilingual model", () => {
    expect(languageTable(facts, PREFERRED_MODEL).find((r) => r.language === "lt")?.recommended).toBe("large-v3-turbo-q5_0");
  });
});

describe("resolveLanguage", () => {
  it("keeps a language the model handles", () => {
    expect(resolveLanguage(whisper, "de")).toEqual({ language: "de", changed: false });
    expect(resolveLanguage(whisper, "auto")).toEqual({ language: "auto", changed: false });
  });

  it("switches to English and says so when the model lacks the saved language", () => {
    expect(resolveLanguage(parakeet, "ar")).toEqual({ language: "en", changed: true });
  });

  it("does not keep automatic detection on a model that cannot detect", () => {
    expect(resolveLanguage(parakeet, "auto")).toEqual({ language: "en", changed: true });
  });

  it("repairs garbage and missing values", () => {
    expect(resolveLanguage(whisper, undefined)).toEqual({ language: "en", changed: true });
    expect(resolveLanguage(whisper, "klingon")).toEqual({ language: "en", changed: true });
    expect(resolveLanguage(whisper, 42)).toEqual({ language: "en", changed: true });
  });

  it("picks the first real language of a model that has no English", () => {
    expect(resolveLanguage({ id: "x", languages: ["auto", "ar"], detects: true }, "de")).toEqual({ language: "ar", changed: true });
    expect(resolveLanguage({ id: "x", languages: [], detects: false }, "de")).toEqual({ language: "en", changed: true });
  });
});

describe("labels", () => {
  it("names the codes", () => {
    expect(languageLabel("auto")).toBe("Detect automatically");
    expect(languageLabel("lt")).toBe("Lithuanian");
    expect(isSttLanguage("lt")).toBe(true);
    expect(isSttLanguage("xx")).toBe(false);
    expect(isSttLanguage(null)).toBe(false);
  });
});
