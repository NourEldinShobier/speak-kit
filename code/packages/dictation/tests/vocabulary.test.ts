import { describe, expect, it } from "vite-plus/test";
import {
  addPronunciation,
  addTerm,
  applyReadAs,
  buildPrompt,
  exportVocabulary,
  importVocabulary,
  matchTerms,
  mergeTerm,
  mergeTerms,
  overridesShared,
  promptFor,
  removeTerm,
  swapRules,
  updateTerm,
  MAX_HEARD,
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

  it("accepts exactly 200 characters and refuses 201, reporting the length", () => {
    expect(addTerm([], { word: "x".repeat(MAX_WORD) }).ok).toBe(true);
    expect(addTerm([], { word: "x".repeat(MAX_WORD + 1) })).toEqual({ ok: false, error: "too-long", length: 201 });
  });

  it("keeps the options of an entry: where it applies, capitals, removal and whether the speech model is told", () => {
    const r = must(addTerm([], { word: "Claude Code", soundsLike: ["cloud code"], app: "Code.exe", matchCase: true, remove: false, swapOnly: true }));
    expect(r.term).toMatchObject({ word: "Claude Code", soundsLike: ["cloud code"], app: "code", matchCase: true, swapOnly: true });
    expect(r.term).not.toHaveProperty("remove");
  });

  it("allows the same word for another program, and refuses it for the same one", () => {
    const here = must(addTerm([], { word: "Claude Code", app: "code.exe" })).list;
    expect(addTerm(here, { word: "claude code" }).ok).toBe(true);
    expect(addTerm(here, { word: "claude code", app: "Code" })).toMatchObject({ ok: false, error: "duplicate" });
  });

  it("keeps a spelling of a program apart from the same spelling for everywhere", () => {
    const list = [t("a", "Claude Code", ["cloud code"])];
    const r = must(addTerm(list, { word: "Claude Code CLI", soundsLike: ["cloud code"], app: "slack" }));
    expect(r.moved).toEqual([]);
    expect(r.list[0]?.soundsLike).toEqual(["cloud code"]);
  });

  it("merges the spellings of an entry into the entry for the same word, and calls it a duplicate when nothing is new", () => {
    const list = [t("a", "Claude Code", ["cloud code"])];
    expect(must(mergeTerm(list, { word: "claude code", soundsLike: ["clawd code", "Cloud Code"] })).list[0]).toMatchObject({ id: "a", word: "Claude Code", soundsLike: ["cloud code", "clawd code"] });
    expect(mergeTerm(list, { word: "Claude Code", soundsLike: ["cloud code"] })).toMatchObject({ ok: false, error: "duplicate" });
    expect(mergeTerm(list, { word: "Claude Code", soundsLike: ["x"], matchCase: true })).toMatchObject({ ok: false, error: "conflict" });
    expect(mergeTerm([t("a", "um", [])], { word: "um", remove: true })).toMatchObject({ ok: false, error: "conflict" });
    expect(must(mergeTerm(list, { word: "Claude Code", soundsLike: ["x"], swapOnly: true })).list[0]?.swapOnly).toBeUndefined();
    expect(must(mergeTerm(list, { word: "Other", soundsLike: ["x"] })).list).toHaveLength(2);
  });

  it("keeps a spelling that differs from the word only by capitals, and drops one that is the word", () => {
    expect(must(addTerm([], { word: "GitHub", soundsLike: ["github", "GitHub"] })).term.soundsLike).toEqual(["github"]);
    expect(must(mergeTerm([t("a", "iPhone", [])], { word: "iPhone", soundsLike: ["iphone", "iPhone"] })).list[0]?.soundsLike).toEqual(["iphone"]);
    expect(swapRules([t("a", "GitHub", ["github"])], undefined)).toEqual([{ from: "github", to: "GitHub" }]);
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
    expect(must(addTerm([], { word: "OAuth", soundsLike: ["OAuth", "oh auth"] })).term.soundsLike).toEqual(["oh auth"]);
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

describe("which words the speech model is told", () => {
  const email = t("e", "me@example.com", ["me at example dot com"]);

  it("leaves out an entry with symbols or more than three words, and one that asks to be only swapped", () => {
    const list = [t("1", "Kubernetes"), email, t("3", "Dear Sir or Madam, kind regards"), t("4", "C:\\work"), t("5", "https://example.com"), { ...t("6", "Grafana"), swapOnly: true }];
    expect(buildPrompt(list)).toMatchObject({ text: "Kubernetes", included: 1, dropped: 0 });
  });

  it("sends an entry with symbols when it asks for that, and leaves out an entry that removes text or is a suggestion", () => {
    const list = [
      { ...email, swapOnly: false },
      { ...t("2", "um"), remove: true },
      { ...t("3", "Claude Code", ["cloud code"]), suggested: true },
    ];
    expect(buildPrompt(list).text).toBe("me@example.com");
  });

  it("still swaps the entry that is not sent", () => {
    expect(swapRules([email], undefined)).toEqual([{ from: "me at example dot com", to: "me@example.com" }]);
  });
});

describe("rules and search from sounds-like", () => {
  const terms = [t("1", "Kubernetes", ["cooper netties", "kuber nettys"]), t("2", "pnpm", ["p n p m"])];

  it("makes one replacement rule per sounds-like spelling", () => {
    expect(swapRules(terms, undefined)).toEqual([
      { from: "cooper netties", to: "Kubernetes" },
      { from: "kuber nettys", to: "Kubernetes" },
      { from: "p n p m", to: "pnpm" },
    ]);
  });

  it("carries the options: capitals, removal, and the program, whose rules come first", () => {
    const list = [t("1", "Kubernetes", ["kube"]), { ...t("2", "going to", ["gonna"]), matchCase: true }, { ...t("3", "um", ["uh"]), remove: true }, { ...t("4", "K8s", ["kube"]), app: "slack" }];
    expect(swapRules(list, "Slack.exe")).toEqual([
      { from: "kube", to: "K8s" },
      { from: "kube", to: "Kubernetes" },
      { from: "gonna", to: "going to", matchCase: true },
      { from: "um", to: "" },
      { from: "uh", to: "" },
    ]);
    expect(swapRules(list, undefined).map((r) => r.to)).toEqual(["Kubernetes", "going to", "", ""]);
  });

  it("finds the word from what the model would have heard, even a part of it", () => {
    expect(matchTerms(terms, "cooper netties")).toEqual([{ term: terms[0], via: "cooper netties" }]);
    expect(matchTerms(terms, "NETTIES cooper")).toHaveLength(1);
    expect(matchTerms(terms, "zebra")).toEqual([]);
    expect(matchTerms(terms, "   ")).toEqual([]);
  });
});

describe("export and import", () => {
  const vocab: Vocabulary = {
    terms: [
      t("1", "Kubernetes", ["cooper netties", "kuber nettys"]),
      t("2", "Grafana"),
      { ...t("3", 'say "hi", ok', ["a b"]), app: "code", matchCase: true },
      { ...t("4", "um", ["er"]), remove: true },
    ],
  };
  const empty: Vocabulary = { terms: [] };
  const flat = (v: Vocabulary) => v.terms.map(({ id: _, ...rest }) => rest);

  it("writes everything as json with a version, words only as text and the heard-as pairs as csv", () => {
    expect(JSON.parse(exportVocabulary(vocab, "json"))).toEqual({
      version: 2,
      terms: [
        { word: "Kubernetes", soundsLike: ["cooper netties", "kuber nettys"] },
        { word: "Grafana", soundsLike: [] },
        { word: 'say "hi", ok', soundsLike: ["a b"], app: "code", matchCase: true },
        { word: "um", soundsLike: ["er"], remove: true },
      ],
    });
    expect(exportVocabulary(vocab, "txt")).toBe('Kubernetes | cooper netties, kuber nettys\nGrafana\nsay "hi", ok | a b\num | er');
    expect(exportVocabulary(vocab, "csv")).toBe('from,to\ncooper netties,Kubernetes\nkuber nettys,Kubernetes\na b,"say ""hi"", ok"\num,\ner,');
  });

  it("does not export a suggestion", () => {
    expect(JSON.parse(exportVocabulary({ terms: [{ ...t("1", "Claude Code", ["cloud code"]), suggested: true }] }, "json")).terms).toEqual([]);
  });

  it("round-trips json with every option into an empty list", () => {
    expect(flat(importVocabulary(empty, exportVocabulary(vocab, "json"), "json").vocabulary)).toEqual(flat(vocab));
  });

  it("round-trips the words of the text format and the pairs of the csv format", () => {
    const words = importVocabulary(empty, exportVocabulary(vocab, "txt"), "txt").vocabulary.terms;
    expect(words.map((x) => [x.word, x.soundsLike])).toEqual(vocab.terms.map((x) => [x.word, x.soundsLike]));
    const pairs = importVocabulary(empty, exportVocabulary(vocab, "csv"), "csv").vocabulary.terms;
    expect(pairs.map((x) => [x.word, x.soundsLike, !!x.remove])).toEqual([
      ["Kubernetes", ["cooper netties", "kuber nettys"], false],
      ['say "hi", ok', ["a b"], false],
      ["um", [], true],
      ["er", [], true],
    ]);
  });

  it("skips duplicates and too-long entries and lists them", () => {
    const long = "y".repeat(MAX_WORD + 1);
    const r = importVocabulary(vocab, `Grafana\nNewWord | nw\n${long}\nOther | ${"z".repeat(MAX_HEARD + 1)}\n`, "txt");
    expect(r).toMatchObject({ added: 1, duplicates: 1, tooLong: 2 });
    expect(r.skipped.map((s) => s.reason)).toEqual(["duplicate", "too-long", "too-long"]);
    expect(r.skipped[0]).toEqual({ line: "Grafana", reason: "duplicate" });
    expect(r.vocabulary.terms).toHaveLength(5);
  });

  it("adds the spellings of an entry to the word that is there, and skips what is already there", () => {
    const r = importVocabulary(vocab, "Kubernetes | kube, cooper netties\n", "txt");
    expect(r.added).toBe(1);
    expect(r.vocabulary.terms[0]?.soundsLike).toEqual(["cooper netties", "kuber nettys", "kube"]);
    expect(importVocabulary(vocab, "Kubernetes | Cooper Netties\n", "txt")).toMatchObject({ added: 0, duplicates: 1 });
  });

  it("reads the old file format: replacements become words heard as the phrase, an empty replacement removes the phrase", () => {
    const old = JSON.stringify({
      version: 1,
      terms: [{ word: "Grafana", soundsLike: ["gruh fan ah"] }],
      replacements: [
        { from: "gonna", to: "going to", matchCase: true },
        { from: "cloud code", to: "Claude Code" },
        { from: "clawd code", to: "Claude Code" },
        { from: "um", to: "" },
      ],
    });
    expect(flat(importVocabulary(empty, old, "json").vocabulary)).toEqual([
      { word: "Grafana", soundsLike: ["gruh fan ah"] },
      { word: "going to", soundsLike: ["gonna"], matchCase: true, swapOnly: true },
      { word: "Claude Code", soundsLike: ["cloud code", "clawd code"], swapOnly: true },
      { word: "um", soundsLike: [], remove: true },
    ]);
  });

  it("reads the old csv of replacements and the corrections of a file", () => {
    const r = importVocabulary(empty, "from,to\nA, B\nA B,x\nx,y\nx,z\n", "csv");
    expect(r.added).toBe(3);
    expect(r.duplicates).toBe(1);
    const fixes = JSON.stringify({ corrections: [{ heard: "cloud code", correct: "Claude Code", app: "code.exe", count: 3 }] });
    expect(flat(importVocabulary(empty, fixes, "json").vocabulary)).toEqual([{ word: "Claude Code", soundsLike: ["cloud code"], app: "code" }]);
  });

  it("refuses a file that is not json, one from a newer version, and one that is not an object, adding nothing", () => {
    expect(importVocabulary(vocab, "{nope", "json")).toMatchObject({ error: "unreadable", added: 0 });
    expect(importVocabulary(vocab, "42", "json")).toMatchObject({ error: "unreadable" });
    expect(importVocabulary(vocab, "null", "json")).toMatchObject({ error: "unreadable" });
    expect(importVocabulary(vocab, '{"version":3,"terms":[{"word":"x"}]}', "json")).toMatchObject({ error: "newer", added: 0 });
  });

  it("reports malformed json entries as invalid and keeps the rest", () => {
    const r = importVocabulary(empty, JSON.stringify({ version: 1, terms: [{ word: "ok" }, { nope: 1 }, 5], replacements: [{ from: "a" }] }), "json");
    expect(r.added).toBe(1);
    expect(r.skipped.map((s) => s.reason)).toEqual(["invalid", "invalid", "invalid"]);
  });

  it("handles empty input, windows line endings and a header-less csv", () => {
    expect(importVocabulary(vocab, "", "txt")).toMatchObject({ added: 0, skipped: [] });
    expect(importVocabulary(empty, "a\r\nb\r\n", "txt").added).toBe(2);
    expect(flat(importVocabulary(empty, "x,y\r\n", "csv").vocabulary)).toEqual([{ word: "y", soundsLike: ["x"], swapOnly: true }]);
    expect(importVocabulary(empty, "github,GitHub\n", "csv").vocabulary.terms[0]).toMatchObject({ word: "GitHub", soundsLike: ["github"] });
  });

  it("stops at the word limit and says so", () => {
    const full: Vocabulary = { terms: Array.from({ length: MAX_TERMS }, (_, i) => t(`i${i}`, `w${i}`)) };
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
