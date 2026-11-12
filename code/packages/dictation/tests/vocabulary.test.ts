import { describe, expect, it } from "vite-plus/test";
import {
  addPronunciation,
  addTerm,
  applyReadAs,
  buildPrompt,
  exportVocabulary,
  importVocabulary,
  matchTerms,
  mergeTerms,
  overridesShared,
  promptFor,
  removeTerm,
  soundsLikeRules,
  updateTerm,
  MAX_TERMS,
  MAX_WORD,
  type Term,
  type Vocabulary,
} from "../src";

const t = (id: string, word: string, soundsLike: string[] = []): Term => ({ id, word, soundsLike });
const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
};

describe("adding words", () => {
  it("keeps the word and its sounds-like spellings, trimmed and without repeats", () => {
    const r = must(addTerm([], { word: "  Kubernetes ", soundsLike: ["cooper netties", " Cooper  Netties", "", "kuber nettys"] }));
    expect(r.term).toMatchObject({ word: "Kubernetes", soundsLike: ["cooper netties", "kuber nettys"] });
  });

  it("refuses an empty word", () => {
    expect(addTerm([], { word: "   " })).toEqual({ ok: false, error: "empty", length: 0 });
  });

  it("refuses a duplicate in any case and points at the existing entry", () => {
    const list = [t("a", "Kubernetes")];
    expect(addTerm(list, { word: "kubernetes" })).toEqual({ ok: false, error: "duplicate", existing: list[0] });
  });

  it("accepts exactly 60 characters and refuses 61, reporting the length", () => {
    expect(addTerm([], { word: "x".repeat(MAX_WORD) }).ok).toBe(true);
    expect(addTerm([], { word: "x".repeat(MAX_WORD + 1) })).toEqual({ ok: false, error: "too-long", length: 61 });
  });

  it("counts characters, not UTF-16 units", () => {
    expect(addTerm([], { word: "😀".repeat(MAX_WORD) }).ok).toBe(true);
  });

  it("refuses the 501st word", () => {
    const list = Array.from({ length: MAX_TERMS }, (_, i) => t(`i${i}`, `w${i}`));
    expect(addTerm(list, { word: "one more" })).toEqual({ ok: false, error: "full" });
  });

  it("moves an exact sounds-like spelling from the old owner to the new word", () => {
    const list = [t("a", "Wasu", ["wazoo", "wa zoo"])];
    const r = must(addTerm(list, { word: "Wazuh", soundsLike: ["Wa Zoo"] }));
    expect(r.moved).toEqual(["wa zoo"]);
    expect(r.list.find((x) => x.id === "a")?.soundsLike).toEqual(["wazoo"]);
  });

  it("does not list the word as its own sounds-like spelling", () => {
    expect(must(addTerm([], { word: "OAuth", soundsLike: ["oauth", "oh auth"] })).term.soundsLike).toEqual(["oh auth"]);
  });
});

describe("rows by id", () => {
  it("removes the row with that id, and a second delete of the same id changes nothing", () => {
    const list = [t("a", "A"), t("b", "B"), t("c", "C")];
    const once = removeTerm(list, "b");
    expect(once.map((x) => x.id)).toEqual(["a", "c"]);
    expect(removeTerm(once, "b")).toEqual(once);
  });

  it("deleting rapidly keeps the right rows when positions shift", () => {
    let list = [t("a", "A"), t("b", "B"), t("c", "C"), t("d", "D")];
    for (const id of ["a", "c", "a"]) list = removeTerm(list, id);
    expect(list.map((x) => x.id)).toEqual(["b", "d"]);
  });

  it("edits a word in place and refuses a rename onto another word", () => {
    const list = [t("a", "Alpha", ["al fa"]), t("b", "Beta")];
    expect(must(updateTerm(list, "a", { word: "Alpha2" })).list[0]).toMatchObject({ word: "Alpha2", soundsLike: ["al fa"] });
    expect(updateTerm(list, "a", { word: "beta" })).toMatchObject({ ok: false, error: "duplicate" });
    expect(updateTerm(list, "a", { word: "Alpha" }).ok).toBe(true);
    expect(updateTerm(list, "zzz", { word: "x" }).ok).toBe(false);
  });
});

describe("mode words", () => {
  it("win over a shared word with the same spelling or the same sounds-like", () => {
    const shared = [t("s1", "Kubernetes", ["cooper netties"]), t("s2", "Grafana", ["gruh fan ah"])];
    const own = [t("m1", "kubernetes", ["kube"]), t("m2", "Graphana", ["gruh fan ah"])];
    const merged = mergeTerms(shared, own);
    expect(merged.map((x) => x.word)).toEqual(["Grafana", "kubernetes", "Graphana"]);
    expect(merged[0]?.soundsLike).toEqual([]);
  });

  it("says when a mode word replaces the shared spelling", () => {
    const shared = [t("s1", "Kubernetes", ["cooper netties"])];
    expect(overridesShared(shared, t("m", "kubernetes"))).toBe(true);
    expect(overridesShared(shared, t("m", "k8s", ["cooper netties"]))).toBe(true);
    expect(overridesShared(shared, t("m", "pnpm"))).toBe(false);
  });
});

describe("speech model prompt", () => {
  const terms = [t("1", "Kubernetes"), t("2", "Grafana"), t("3", "PostgreSQL")];

  it("joins words in order and counts characters", () => {
    expect(buildPrompt(terms)).toEqual({ text: "Kubernetes, Grafana, PostgreSQL", used: 31, budget: 500, included: 3, dropped: 0 });
  });

  it("stops before the word that would pass the budget, never cutting one in half", () => {
    expect(buildPrompt(terms, 21)).toEqual({ text: "Kubernetes, Grafana", used: 19, budget: 21, included: 2, dropped: 1 });
    expect(buildPrompt(terms, 19).included).toBe(2);
    expect(buildPrompt(terms, 18).included).toBe(1);
  });

  it("is not stopped at 64 words when the characters fit", () => {
    const many = Array.from({ length: 100 }, (_, i) => t(`i${i}`, `w${i}`));
    expect(buildPrompt(many, 500).included).toBeGreaterThan(64);
  });

  it("gives nothing for an empty list and for a budget too small for the first word", () => {
    expect(buildPrompt([])).toMatchObject({ text: "", included: 0, dropped: 0 });
    expect(buildPrompt(terms, 3)).toMatchObject({ text: "", included: 0, dropped: 3 });
  });

  it("is sent for the model that reads it, dropped with a warning for the one that does not, and silent when off or empty", () => {
    expect(promptFor("large-v3-turbo-q5_0", terms, true)).toEqual({ prompt: "Kubernetes, Grafana, PostgreSQL", unsupported: false });
    expect(promptFor("parakeet-tdt-0.6b-v3-q4_0", terms, true)).toEqual({ prompt: "", unsupported: true });
    expect(promptFor("parakeet-tdt-0.6b-v3-q4_0", terms, false)).toEqual({ prompt: "", unsupported: false });
    expect(promptFor("parakeet-tdt-0.6b-v3-q4_0", [], true)).toEqual({ prompt: "", unsupported: false });
  });
});

describe("rules and search from sounds-like", () => {
  const terms = [t("1", "Kubernetes", ["cooper netties", "kuber nettys"]), t("2", "pnpm", ["p n p m"])];

  it("makes one replacement rule per sounds-like spelling", () => {
    expect(soundsLikeRules(terms)).toEqual([
      { from: "cooper netties", to: "Kubernetes" },
      { from: "kuber nettys", to: "Kubernetes" },
      { from: "p n p m", to: "pnpm" },
    ]);
  });

  it("finds the word from what the model would have heard, even a part of it", () => {
    expect(matchTerms(terms, "cooper netties")).toEqual([{ term: terms[0], via: "cooper netties" }]);
    expect(matchTerms(terms, "NETTIES cooper")).toHaveLength(1);
    expect(matchTerms(terms, "zebra")).toEqual([]);
    expect(matchTerms(terms, "   ")).toEqual([]);
  });
});

describe("export and import", () => {
  const vocab: Vocabulary = { terms: [t("1", "Kubernetes", ["cooper netties", "kuber nettys"]), t("2", "Grafana")], replacements: [{ from: "a, b", to: 'say "hi"' }] };

  it("writes everything as json with a version, words only as text and replacements as csv", () => {
    expect(JSON.parse(exportVocabulary(vocab, "json"))).toEqual({
      version: 1,
      terms: [{ word: "Kubernetes", soundsLike: ["cooper netties", "kuber nettys"] }, { word: "Grafana", soundsLike: [] }],
      replacements: [{ from: "a, b", to: 'say "hi"' }],
    });
    expect(exportVocabulary(vocab, "txt")).toBe("Kubernetes | cooper netties, kuber nettys\nGrafana");
    expect(exportVocabulary(vocab, "csv")).toBe('from,to\n"a, b","say ""hi"""');
  });

  it("round-trips every format into an empty list", () => {
    for (const f of ["json", "txt", "csv"] as const) {
      const back = importVocabulary({ terms: [], replacements: [] }, exportVocabulary(vocab, f), f);
      if (f !== "csv") expect(back.vocabulary.terms.map((x) => [x.word, x.soundsLike])).toEqual(vocab.terms.map((x) => [x.word, x.soundsLike]));
      if (f !== "txt") expect(back.vocabulary.replacements).toEqual(vocab.replacements);
    }
  });

  it("skips duplicates and too-long entries and lists them", () => {
    const long = "y".repeat(61);
    const r = importVocabulary(vocab, `Grafana\nNewWord | nw\n${long}\n`, "txt");
    expect(r).toMatchObject({ addedWords: 1, duplicates: 1, tooLong: 1 });
    expect(r.skipped).toEqual([
      { line: "Grafana", reason: "duplicate" },
      { line: long, reason: "too-long" },
    ]);
    expect(r.vocabulary.terms).toHaveLength(3);
  });

  it("adds new replacements and skips a rule that is already there", () => {
    const r = importVocabulary(vocab, "from,to\nA, B\nA B,x\nx,y\nx,z\n", "csv");
    expect(r.addedReplacements).toBe(3);
    expect(r.duplicates).toBe(1);
  });

  it("refuses a file that is not json, one from a newer version, and one that is not an object, adding nothing", () => {
    expect(importVocabulary(vocab, "{nope", "json")).toMatchObject({ error: "unreadable", addedWords: 0 });
    expect(importVocabulary(vocab, "42", "json")).toMatchObject({ error: "unreadable" });
    expect(importVocabulary(vocab, "null", "json")).toMatchObject({ error: "unreadable" });
    expect(importVocabulary(vocab, '{"version":2,"terms":[{"word":"x"}]}', "json")).toMatchObject({ error: "newer", addedWords: 0 });
  });

  it("reports malformed json entries as invalid and keeps the rest", () => {
    const r = importVocabulary({ terms: [], replacements: [] }, JSON.stringify({ version: 1, terms: [{ word: "ok" }, { nope: 1 }, 5], replacements: [{ from: "a" }] }), "json");
    expect(r.addedWords).toBe(1);
    expect(r.skipped.map((s) => s.reason)).toEqual(["invalid", "invalid", "invalid"]);
  });

  it("handles empty input, windows line endings and a header-less csv", () => {
    expect(importVocabulary(vocab, "", "txt")).toMatchObject({ addedWords: 0, skipped: [] });
    expect(importVocabulary({ terms: [], replacements: [] }, "a\r\nb\r\n", "txt").addedWords).toBe(2);
    expect(importVocabulary({ terms: [], replacements: [] }, "x,y\r\n", "csv").vocabulary.replacements).toEqual([{ from: "x", to: "y" }]);
  });

  it("stops at the word limit and says so", () => {
    const full: Vocabulary = { terms: Array.from({ length: MAX_TERMS }, (_, i) => t(`i${i}`, `w${i}`)), replacements: [] };
    expect(importVocabulary(full, "extra", "txt").skipped).toEqual([{ line: "extra", reason: "full" }]);
  });
});

describe("read as", () => {
  it("replaces whole words only, longest first, once", () => {
    const list = [addPronunciation([], { written: "k8s", spoken: "kubernetes" })];
    const first = must(list[0]!).list;
    const both = must(addPronunciation(first, { written: "k8s cluster", spoken: "the cluster" })).list;
    expect(applyReadAs("Deploy to k8s and the k8s cluster, not k8sx.", both)).toBe("Deploy to kubernetes and the the cluster, not k8sx.");
    expect(applyReadAs("unchanged", [])).toBe("unchanged");
  });

  it("refuses empty, same, duplicate and too-long entries", () => {
    const one = must(addPronunciation([], { written: "SQL", spoken: "sequel" })).list;
    expect(addPronunciation(one, { written: "", spoken: "x" })).toEqual({ ok: false, error: "empty" });
    expect(addPronunciation(one, { written: "x", spoken: "x" })).toEqual({ ok: false, error: "same" });
    expect(addPronunciation(one, { written: "sql", spoken: "ess" })).toEqual({ ok: false, error: "duplicate" });
    expect(addPronunciation(one, { written: "y".repeat(61), spoken: "x" })).toEqual({ ok: false, error: "too-long" });
  });
});
