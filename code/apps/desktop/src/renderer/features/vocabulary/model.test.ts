import { describe, expect, it } from "vite-plus/test";
import { importVocabulary, type Term } from "@speakkit/dictation";
import { checkDraft, cleanupRows, filterTerms, importView, promptSummary, savedTerms, seenText, suggestedTerms, termNotes, wordCount } from "./model";

const t = (id: string, word: string, soundsLike: string[] = []): Term => ({ id, word, soundsLike });

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
    const c = checkDraft(terms, { word: "x".repeat(214), soundsLike: "" });
    expect(c).toMatchObject({ blocked: true, counter: { length: 214, max: 200, over: true } });
    expect(c.message).toContain("214");
    expect(checkDraft(terms, { word: "x".repeat(200), soundsLike: "" }).blocked).toBe(false);
  });

  it("takes a program file name for the scope and refuses a name with spaces or a path", () => {
    expect(checkDraft(terms, { word: "Grafana", soundsLike: "", app: "code.exe" }).blocked).toBe(false);
    expect(checkDraft(terms, { word: "Grafana", soundsLike: "", app: " Code.EXE " }).blocked).toBe(false);
    expect(checkDraft(terms, { word: "Grafana", soundsLike: "", app: "Visual Studio Code" })).toMatchObject({ blocked: true, message: "Use the program file name, such as code.exe." });
    expect(checkDraft(terms, { word: "Grafana", soundsLike: "", app: "C:/Apps/code.exe" }).blocked).toBe(true);
  });

  it("allows the word of the list for one program, and ignores a suggestion with the same word", () => {
    expect(checkDraft(terms, { word: "Kubernetes", soundsLike: "", app: "code.exe" }).blocked).toBe(false);
    const withApp = [{ ...t("a", "Kubernetes"), app: "code" }];
    expect(checkDraft(withApp, { word: "kubernetes", soundsLike: "", app: "Code.exe" })).toMatchObject({ blocked: true, existing: withApp[0] });
    expect(checkDraft([{ ...t("s", "Kubernetes", ["kuber"]), suggested: true }], { word: "Kubernetes", soundsLike: "" }).blocked).toBe(false);
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

  it("keeps suggestions out of the words and says how often one was seen", () => {
    const suggestion = { ...t("s", "Claude Code", ["cloud code"]), suggested: true, learned: { heard: "cloud code", count: 1, createdAt: 1 } };
    expect(savedTerms([...terms, suggestion]).map((x) => x.id)).toEqual(["a", "b"]);
    expect(suggestedTerms([...terms, suggestion]).map((x) => x.id)).toEqual(["s"]);
    expect(seenText(suggestion)).toBe("Seen once");
    expect(seenText({ learned: { heard: "x", count: 3, createdAt: 1 } })).toBe("Seen 3 times");
  });

  it("notes where a word applies and the options that are set", () => {
    expect(termNotes(t("a", "Kubernetes"))).toEqual([]);
    expect(termNotes({ ...t("a", "Kubernetes"), app: "code", matchCase: true })).toEqual(["Only in code.exe", "Matches capitals"]);
    expect(termNotes({ ...t("a", "me@example.com", ["me at example dot com"]) })).toEqual(["Not sent to the speech model"]);
    expect(termNotes({ ...t("a", "um", ["er"]), remove: true })).toEqual(["Removes the phrase"]);
  });
});

describe("speech model prompt card", () => {
  const terms = Array.from({ length: 60 }, (_, i) => t(`i${i}`, `Longword${i}`));

  it("says how many words and characters the model reads and that the rest still work", () => {
    const s = promptSummary(terms, { model: "large-v3-turbo-q5_0", on: true, modelName: "Whisper" });
    expect(s.state).toBe("on");
    expect(s.line).toMatch(/^\d+ of 60 words read by the model, \d+ of 500 characters\.$/);
    expect(s.plan.included).toBeLessThan(60);
    expect(s.note).toBe(`The other ${s.plan.dropped} still work: they are fixed after the model has heard you.`);
  });

  it("is off when the switch is off, empty with no words, and has no note when everything fits", () => {
    expect(promptSummary(terms, { model: "large-v3-turbo-q5_0", on: false, modelName: "W" }).state).toBe("off");
    expect(promptSummary([], { model: "large-v3-turbo-q5_0", on: true, modelName: "W" }).state).toBe("empty");
    expect(promptSummary([t("a", "One")], { model: "large-v3-turbo-q5_0", on: true, modelName: "W" })).toMatchObject({ line: "1 of 1 word read by the model, 3 of 500 characters." });
    expect(promptSummary([t("a", "One")], { model: "large-v3-turbo-q5_0", on: true, modelName: "W" }).note).toBeUndefined();
  });

  it("is not used by a model that cannot read it, and says nothing is blocked", () => {
    const s = promptSummary(terms, { model: "parakeet-tdt-0.6b-v3-q4_0", on: true, modelName: "Parakeet v3" });
    expect(s).toMatchObject({ state: "unsupported", note: 'Parakeet v3 cannot read a word list. Words you gave a "Heard as" spelling still work, and nothing is blocked.' });
  });

  it("counts only the words the model is told, not entries that are only swapped", () => {
    const list = [t("a", "Grafana"), t("b", "me@example.com", ["me at example dot com"]), { ...t("c", "um"), remove: true }];
    expect(promptSummary(list, { model: "large-v3-turbo-q5_0", on: true, modelName: "W" }).line).toBe("1 of 1 word read by the model, 7 of 500 characters.");
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

  it("lists the switches, with no scope on the language-free ones", () => {
    const rows = byKey("en");
    expect(Object.keys(rows)).toEqual(["fillers", "spokenSymbols", "spokenFormatting", "autoCapitalize", "stripFinalStop", "trailingSpace"]);
    expect(rows.autoCapitalize?.scope).toBeUndefined();
  });
});

describe("import result wording", () => {
  const base = { terms: [t("a", "Grafana")] };

  it("counts what was added and what was skipped, listing the lines", () => {
    const r = importVocabulary(base, `New\nGrafana\n${"y".repeat(201)}\n`, "txt");
    const v = importView(r, "words.txt");
    expect(v).toMatchObject({ title: "Import finished", failed: false });
    expect(v.body).toEqual(["1 entry was added.", "1 duplicate and 1 entry that is too long were skipped."]);
    expect(v.skipped).toEqual([
      { line: "Grafana", why: "already in the list" },
      { line: "y".repeat(201), why: "too long" },
    ]);
  });

  it("uses the singular for one duplicate and nothing extra when nothing was skipped", () => {
    expect(importView(importVocabulary(base, "Grafana", "txt"), "f").body[1]).toBe("1 duplicate was skipped.");
    expect(importView(importVocabulary(base, "Other", "txt"), "f").body).toEqual(["1 entry was added."]);
    expect(importView(importVocabulary(base, "Other\nMore", "txt"), "f").body).toEqual(["2 entries were added."]);
  });

  it("imports an old export with replacements as words heard as the replaced phrase", () => {
    const old = JSON.stringify({ version: 1, terms: [], replacements: [{ from: "cloud code", to: "Claude Code" }] });
    const r = importVocabulary(base, old, "json");
    expect(importView(r, "old.json").body).toEqual(["1 entry was added."]);
    expect(r.vocabulary.terms.map((x) => [x.word, x.soundsLike])).toEqual([
      ["Grafana", []],
      ["Claude Code", ["cloud code"]],
    ]);
  });

  it("explains a file that cannot be read or comes from a newer version", () => {
    expect(importView(importVocabulary(base, "{", "json"), "bad.json")).toMatchObject({ failed: true, body: ["bad.json is not a file Speak Kit can read. Nothing was added."] });
    expect(importView(importVocabulary(base, '{"version":9}', "json"), "n.json").body[0]).toContain("newer Speak Kit");
  });
});
