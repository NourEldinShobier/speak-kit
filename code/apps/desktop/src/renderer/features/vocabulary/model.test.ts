import { describe, expect, it } from "vite-plus/test";
import { importVocabulary, type Term } from "@speakkit/dictation";
import { changedWords, checkDraft, cleanupRows, filterTerms, importView, promptSummary, testStages, wordCount } from "./model";

const t = (id: string, word: string, soundsLike: string[] = []): Term => ({ id, word, soundsLike });
const cleanup = { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, trailingSpace: false, lowercase: false, stripFinalStop: false };

describe("add word dialog", () => {
  const terms = [t("a", "Kubernetes")];

  it("stays disabled with nothing typed and enables for a new word", () => {
    expect(checkDraft(terms, { word: "  ", soundsLike: "" })).toEqual({ blocked: true });
    expect(checkDraft(terms, { word: "Grafana", soundsLike: "" })).toMatchObject({ blocked: false });
  });

  it("names the word that is already there and offers the entry", () => {
    const c = checkDraft(terms, { word: "kubernetes", soundsLike: "" });
    expect(c).toMatchObject({ blocked: true, message: '"Kubernetes" is already in the list.', existing: terms[0] });
  });

  it("does not call a word a duplicate of itself while editing it", () => {
    expect(checkDraft(terms, { word: "Kubernetes", soundsLike: "x" }, "a").blocked).toBe(false);
  });

  it("counts characters and says how far over it is", () => {
    const c = checkDraft(terms, { word: "x".repeat(74), soundsLike: "" });
    expect(c).toMatchObject({ blocked: true, counter: { length: 74, max: 60, over: true } });
    expect(c.message).toContain("74");
    expect(checkDraft(terms, { word: "x".repeat(60), soundsLike: "" }).blocked).toBe(false);
  });

  it("says the list is full at 500", () => {
    const full = Array.from({ length: 500 }, (_, i) => t(`i${i}`, `w${i}`));
    expect(checkDraft(full, { word: "new", soundsLike: "" })).toMatchObject({ blocked: true });
    expect(checkDraft(full, { word: "w1", soundsLike: "" }, "i1").blocked).toBe(false);
  });
});

describe("list", () => {
  const terms = [t("a", "Kubernetes", ["cooper netties"]), t("b", "Grafana", ["gruh fan ah"])];
  it("filters by word or sounds-like, ignoring case", () => {
    expect(filterTerms(terms, "GRAF").map((x) => x.id)).toEqual(["b"]);
    expect(filterTerms(terms, "netties").map((x) => x.id)).toEqual(["a"]);
    expect(filterTerms(terms, "  ").length).toBe(2);
    expect(filterTerms(terms, "zzz")).toEqual([]);
  });
  it("shows the count against 500", () => expect(wordCount(42)).toBe("42 of 500 words"));
});

describe("speech model prompt card", () => {
  const terms = Array.from({ length: 60 }, (_, i) => t(`i${i}`, `Longword${i}`));

  it("says how many words and characters the model reads and that the rest still work", () => {
    const s = promptSummary(terms, "large-v3-turbo-q5_0", true, "Whisper");
    expect(s.state).toBe("on");
    expect(s.line).toMatch(/^\d+ of 60 words read by the model, \d+ of 500 characters\.$/);
    expect(s.plan.included).toBeLessThan(60);
    expect(s.note).toBe(`The other ${s.plan.dropped} still work: they are fixed after the model has heard you.`);
  });

  it("is off when the switch is off, empty with no words, and has no note when everything fits", () => {
    expect(promptSummary(terms, "large-v3-turbo-q5_0", false, "W").state).toBe("off");
    expect(promptSummary([], "large-v3-turbo-q5_0", true, "W").state).toBe("empty");
    expect(promptSummary([t("a", "One")], "large-v3-turbo-q5_0", true, "W")).toMatchObject({ line: "1 of 1 word read by the model, 3 of 500 characters." });
    expect(promptSummary([t("a", "One")], "large-v3-turbo-q5_0", true, "W").note).toBeUndefined();
  });

  it("is not used by a model that cannot read it, and says nothing is blocked", () => {
    const s = promptSummary(terms, "parakeet-tdt-0.6b-v3-q4_0", true, "Parakeet v3");
    expect(s).toMatchObject({ state: "unsupported", note: "Parakeet v3 cannot read a word list. Your words still work through replacements, and nothing is blocked." });
  });
});

describe("clean-up rows by language", () => {
  const byKey = (lang: string) => Object.fromEntries(cleanupRows(lang).map((r) => [r.key, r]));

  it("scopes fillers to English and lets it work there", () => {
    expect(byKey("en").fillers).toMatchObject({ scope: "English only" });
    expect(byKey("en").fillers?.unavailable).toBeUndefined();
    expect(byKey("auto").fillers?.unavailable).toBeUndefined();
  });

  it("marks fillers and formatting that German and Arabic do not have", () => {
    expect(byKey("de").fillers?.unavailable).toBe("Not available for German yet.");
    expect(byKey("ar").spokenFormatting?.unavailable).toBe("Not available for Arabic yet.");
    expect(byKey("de").spokenSymbols?.unavailable).toBeUndefined();
    expect(byKey("de").spokenFormatting?.unavailable).toBeUndefined();
  });

  it("has the two new switches and the language-free ones without scope", () => {
    const rows = byKey("en");
    expect(Object.keys(rows)).toEqual(["fillers", "spokenSymbols", "spokenFormatting", "autoCapitalize", "lowercase", "stripFinalStop", "trailingSpace"]);
    expect(rows.lowercase?.scope).toBeUndefined();
  });
});

describe("rules tester", () => {
  const terms = [t("k", "Kubernetes", ["cooper netties"])];
  const replacements = [{ from: "my email", to: "sam@example.com" }];

  it("shows the four steps ending in the final text", () => {
    const r = testStages("tell the team the cooper netties update is live and send it to my email", { terms, replacements, cleanup: { ...cleanup, fillers: false }, language: "en" });
    expect(r.stages.map((s) => [s.key, s.text])).toEqual([
      ["heard", "tell the team the cooper netties update is live and send it to my email"],
      ["words", "tell the team the Kubernetes update is live and send it to my email"],
      ["replacements", "tell the team the Kubernetes update is live and send it to sam@example.com"],
      ["cleanup", "Tell the team the Kubernetes update is live and send it to sam@example.com"],
    ]);
    expect(r.final).toBe("Tell the team the Kubernetes update is live and send it to sam@example.com");
    expect(r.stages[1]?.note).toBe("Changed");
  });

  it("says when a step has no rules or changed nothing", () => {
    const r = testStages("hello", { terms: [], replacements: [], cleanup, language: "en" });
    expect(r.stages.map((s) => s.note)).toEqual(["The raw text", "No sounds-like rules", "No replacement rules", "fillers, symbols, formatting, capital letter"]);
    expect(testStages("hello", { terms, replacements, cleanup, language: "en" }).stages[2]?.note).toBe("Nothing changed");
  });

  it("leaves numbers-only text untouched through every step", () => {
    const r = testStages("12 34", { terms, replacements, cleanup, language: "en" });
    expect(r.stages.map((s) => s.text)).toEqual(["12 34", "12 34", "12 34", "12 34"]);
  });

  it("finds the words to fix: what the model heard and what it should be", () => {
    expect(changedWords("tell cooper netties now", "Tell Kubernetes now")).toEqual({ heard: "cooper netties", word: "Kubernetes" });
    expect(changedWords("same text", "Same text.")).toBeUndefined();
    expect(changedWords("", "")).toBeUndefined();
  });
});

describe("import result wording", () => {
  const base = { terms: [t("a", "Grafana")], replacements: [] };

  it("counts what was added and what was skipped, listing the lines", () => {
    const r = importVocabulary(base, `New\nGrafana\n${"y".repeat(61)}\n`, "txt");
    const v = importView(r, "words.txt");
    expect(v).toMatchObject({ title: "Import finished", failed: false });
    expect(v.body).toEqual(["1 word and 0 replacements were added.", "1 duplicate and 1 entry that is too long were skipped."]);
    expect(v.skipped).toEqual([
      { line: "Grafana", why: "already in the list" },
      { line: "y".repeat(61), why: "too long" },
    ]);
  });

  it("uses the singular for one duplicate and nothing extra when nothing was skipped", () => {
    expect(importView(importVocabulary(base, "Grafana", "txt"), "f").body[1]).toBe("1 duplicate was skipped.");
    expect(importView(importVocabulary(base, "Other", "txt"), "f").body).toEqual(["1 word and 0 replacements were added."]);
  });

  it("explains a file that cannot be read or comes from a newer version", () => {
    expect(importView(importVocabulary(base, "{", "json"), "bad.json")).toMatchObject({ failed: true, body: ["bad.json is not a file Speak Kit can read. Nothing was added."] });
    expect(importView(importVocabulary(base, '{"version":9}', "json"), "n.json").body[0]).toContain("newer Speak Kit");
  });
});
