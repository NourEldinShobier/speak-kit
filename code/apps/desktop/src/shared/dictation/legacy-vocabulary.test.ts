import { describe, expect, it } from "vite-plus/test";
import { loadSettings } from "../settings/settings-file";
import { unifyVocabulary, VOCABULARY_MIGRATION_ID } from "./legacy-vocabulary";

type Raw = Record<string, unknown>;
const unify = (d: Raw) => unifyVocabulary(d);
/** The entries without their ids, which are made up on the way. */
const bare = (list: unknown): unknown[] => (list as Raw[]).map(({ id: _, ...rest }) => rest);
const termsOf = (d: Raw) => bare(unify(d).dictation.terms);

const fix = (over: Raw = {}) => ({ id: "c1", heard: "cloud code", correct: "Claude Code", count: 1, createdAt: 5, ...over });

describe("turning the old replacements into words", () => {
  it("makes the replacement the word, heard as the phrase, and keeps the capitals option", () => {
    expect(
      termsOf({
        replacements: [
          { from: "gonna", to: "going to", matchCase: true },
          { from: "btw", to: "by the way" },
        ],
      }),
    ).toEqual([
      { word: "going to", soundsLike: ["gonna"], matchCase: true, swapOnly: true },
      { word: "by the way", soundsLike: ["btw"], swapOnly: true },
    ]);
  });

  it("keeps a replacement that only changes capitals as a heard-as spelling", () => {
    const got = unify({
      replacements: [
        { from: "github", to: "GitHub" },
        { from: "Iphone", to: "iPhone", matchCase: true },
      ],
    });
    expect(bare(got.dictation.terms)).toEqual([
      { word: "GitHub", soundsLike: ["github"], swapOnly: true },
      { word: "iPhone", soundsLike: ["Iphone"], matchCase: true, swapOnly: true },
    ]);
    expect(got.dropped).toBe(0);
  });

  it("counts a replacement that cannot join the entry of its word, or would write the word in other capitals", () => {
    const rules = [
      { from: "gonna", to: "going to" },
      { from: "gunna", to: "going to", matchCase: true },
      { from: "okay", to: "Ok" },
    ];
    const got = unify({ terms: [{ id: "t1", word: "OK", soundsLike: [] }], replacements: rules });
    expect(bare(got.dictation.terms)).toEqual([
      { word: "OK", soundsLike: ["okay"] },
      { word: "going to", soundsLike: ["gonna"], swapOnly: true },
    ]);
    expect(got.dropped).toBe(2);
    const um = unify({ terms: [{ id: "t1", word: "um", soundsLike: [] }], replacements: [{ from: "um", to: "" }] });
    expect(um.dropped).toBe(1);
  });

  it("makes an empty replacement an entry that removes the phrase", () => {
    expect(termsOf({ replacements: [{ from: "you know", to: "" }] })).toEqual([{ word: "you know", soundsLike: [], remove: true }]);
  });

  it("puts phrases that write the same text on one word, and keeps the words that were there", () => {
    const terms = [{ id: "t1", word: "Claude Code", soundsLike: ["clawd code"] }];
    const got = unify({
      terms,
      replacements: [
        { from: "cloud code", to: "Claude Code" },
        { from: "Cloud Code", to: "Claude Code" },
      ],
    });
    expect(got.dictation.terms).toEqual([{ id: "t1", word: "Claude Code", soundsLike: ["clawd code", "cloud code"] }]);
    expect(got.dropped).toBe(0);
  });

  it("takes a spelling that a replacement and a word both had for the replacement, as the replacement won before", () => {
    const terms = [{ id: "t1", word: "Kubernetes", soundsLike: ["kube"] }];
    expect(termsOf({ terms, replacements: [{ from: "kube", to: "K8s" }] })).toEqual([
      { word: "Kubernetes", soundsLike: [] },
      { word: "K8s", soundsLike: ["kube"], swapOnly: true },
    ]);
  });

  it("removes the old key and changes nothing else in the section", () => {
    const got = unify({ language: "de", replacements: [{ from: "a", to: "b" }] }).dictation;
    expect(got).not.toHaveProperty("replacements");
    expect(got.language).toBe("de");
  });

  it("counts a broken replacement as dropped, and a repeated one not", () => {
    const got = unify({ replacements: [{ from: "", to: "x" }, { from: "a" }, 5, { from: "a", to: "b" }, { from: "a", to: "b" }] });
    expect(bare(got.dictation.terms)).toEqual([{ word: "b", soundsLike: ["a"], swapOnly: true }]);
    expect(got.dropped).toBe(3);
  });
});

describe("turning the old corrections into words", () => {
  it("makes a fix saved on purpose a saved word, and keeps its scope, count, neighbours and sources", () => {
    expect(termsOf({ corrections: [fix({ confirmed: true, app: "slack", left: "opened", right: "and", count: 4, sources: ["e1", "e2"] })] })).toEqual([
      { word: "Claude Code", soundsLike: ["cloud code"], app: "slack", learned: { heard: "cloud code", count: 4, createdAt: 5, left: "opened", right: "and", sources: ["e1", "e2"] } },
    ]);
  });

  it("makes a fix that was only seen a suggestion with its count", () => {
    expect(termsOf({ corrections: [fix({ count: 2 }), fix({ id: "c2", heard: "get hub", correct: "GitHub" })] })).toEqual([
      { word: "Claude Code", soundsLike: ["cloud code"], suggested: true, learned: { heard: "cloud code", count: 2, createdAt: 5 } },
      { word: "GitHub", soundsLike: ["get hub"], suggested: true, learned: { heard: "get hub", count: 1, createdAt: 5 } },
    ]);
  });

  it("adds the fixes saved on purpose to the word they write, and keeps the same word for another program apart", () => {
    const terms = [{ id: "t1", word: "Claude Code", soundsLike: ["clawd code"] }];
    const got = termsOf({ terms, corrections: [fix({ confirmed: true }), fix({ id: "c2", confirmed: true, heard: "clod code", app: "slack" })] });
    expect(got).toEqual([
      { word: "Claude Code", soundsLike: ["clawd code", "cloud code"], learned: { heard: "cloud code", count: 1, createdAt: 5 } },
      { word: "Claude Code", soundsLike: ["clod code"], app: "slack", learned: { heard: "clod code", count: 1, createdAt: 5 } },
    ]);
  });

  it("drops a fix that is already a spelling of the word, and a suggestion that is there twice, without counting them", () => {
    const terms = [{ id: "t1", word: "Claude Code", soundsLike: ["cloud code"] }];
    expect(unify({ terms, corrections: [fix({ confirmed: true }), fix({ id: "c2" })] })).toMatchObject({ dropped: 0, dictation: { terms } });
    const twice = unify({ corrections: [fix(), fix({ id: "c2", heard: "Cloud Code" })] });
    expect(twice.dictation.terms).toHaveLength(1);
    expect(twice.dropped).toBe(0);
  });

  it("counts a fix saved on purpose that cannot join a word with other options", () => {
    const terms = [{ id: "t1", word: "going to", soundsLike: [], matchCase: true }];
    const got = unify({ terms, corrections: [fix({ confirmed: true, heard: "gona", correct: "going to" })] });
    expect(got.dropped).toBe(1);
    expect(got.dictation.terms).toEqual(terms);
  });

  it("removes the old key and counts a broken fix as dropped", () => {
    const got = unify({ corrections: [fix({ confirmed: true }), { id: "x", heard: "", correct: "Z", count: 1, createdAt: 1 }] });
    expect(got.dictation).not.toHaveProperty("corrections");
    expect(got.dropped).toBe(1);
  });
});

describe("the limit of the list", () => {
  const full = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, word: `word${i}`, soundsLike: [] }));

  it("fits what there is room for and counts the rest as dropped", () => {
    const got = unify({
      terms: full(498),
      replacements: [
        { from: "a", to: "x" },
        { from: "b", to: "y" },
        { from: "c", to: "z" },
      ],
    });
    expect(got.dictation.terms).toHaveLength(500);
    expect(got.dropped).toBe(1);
  });

  it("counts a suggestion that does not fit, but joins a saved fix to its word even in a full list", () => {
    const terms = [...full(499), { id: "k", word: "Claude Code", soundsLike: [] }];
    const got = unify({ terms, corrections: [fix({ confirmed: true }), fix({ id: "c2", heard: "get hub", correct: "GitHub" })] });
    expect(got.dictation.terms).toHaveLength(500);
    expect(got.dropped).toBe(1);
  });
});

describe("turning the replacements of a mode into its words", () => {
  const mode = { id: "m1", name: "Chat", apps: ["slack"], sites: [], rewrite: false, template: "tidy", terms: [{ id: "t1", word: "Slack", soundsLike: [] }] };

  it("adds them to the words of the mode, only there, and removes the old key", () => {
    const got = unify({
      replacements: [{ from: "a", to: "b" }],
      modes: [
        {
          ...mode,
          replacements: [
            { from: "ship it", to: "deploy" },
            { from: "um", to: "" },
          ],
        },
        { ...mode, id: "m2", name: "Mail" },
      ],
    });
    const modes = got.dictation.modes as Raw[];
    expect(bare(modes[0]!.terms)).toEqual([
      { word: "Slack", soundsLike: [] },
      { word: "deploy", soundsLike: ["ship it"], swapOnly: true },
      { word: "um", soundsLike: [], remove: true },
    ]);
    expect(modes[0]).not.toHaveProperty("replacements");
    expect(bare(got.dictation.terms)).toEqual([{ word: "b", soundsLike: ["a"], swapOnly: true }]);
    expect(modes[1]).toEqual({ ...mode, id: "m2", name: "Mail" });
  });

  it("converts a mode even when the shared lists were never saved", () => {
    const got = unify({
      modes: [
        {
          ...mode,
          replacements: [
            { from: "x", to: "y" },
            { from: "", to: "bad" },
          ],
        },
      ],
    });
    expect(bare((got.dictation.modes as Raw[])[0]!.terms)).toEqual([
      { word: "Slack", soundsLike: [] },
      { word: "y", soundsLike: ["x"], swapOnly: true },
    ]);
    expect(got.dropped).toBe(1);
  });

  it("counts what does not fit in a full mode", () => {
    const terms = Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, word: `w${i}`, soundsLike: [] }));
    const got = unify({ modes: [{ ...mode, terms, replacements: [{ from: "a", to: "b" }] }] });
    expect(((got.dictation.modes as Raw[])[0]!.terms as unknown[]).length).toBe(500);
    expect(got.dropped).toBe(1);
  });
});

describe("the migration of the settings file", () => {
  const old = { dictation: { replacements: [{ from: "cloud code", to: "Claude Code" }], corrections: [fix({ confirmed: true, heard: "get hub", correct: "GitHub" })] } };

  it("runs once on an old file and the words load with the app's settings", () => {
    const loaded = loadSettings(old);
    expect(loaded.config.appliedMigrations).toContain(VOCABULARY_MIGRATION_ID);
    expect(bare(loaded.config.dictation.terms)).toEqual([
      { word: "Claude Code", soundsLike: ["cloud code"], swapOnly: true },
      { word: "GitHub", soundsLike: ["get hub"], learned: { heard: "get hub", count: 1, createdAt: 5 } },
    ]);
    expect(loaded.needsBackup).toBe(true);
  });

  it("leaves a file that was migrated already as it is, and one with nothing old in it untouched", () => {
    const done = loadSettings({ ...old, appliedMigrations: [VOCABULARY_MIGRATION_ID] });
    expect(done.config.dictation.terms).toEqual([]);
    const fresh = loadSettings({ dictation: { terms: [{ id: "a", word: "Kubernetes", soundsLike: [] }] }, appliedMigrations: [VOCABULARY_MIGRATION_ID] });
    expect(fresh.needsBackup).toBe(false);
    const clean = { dictation: { language: "de", terms: [{ id: "a", word: "Kubernetes", soundsLike: [] }] } };
    expect(unify(clean.dictation).dictation).toBe(clean.dictation);
    expect(loadSettings(clean).config.dictation.terms).toEqual(clean.dictation.terms);
  });

  it("migrates the words of what is saved again only once: the second load changes nothing", () => {
    const first = loadSettings(old);
    const again = loadSettings({ dictation: first.config.dictation, appliedMigrations: first.config.appliedMigrations });
    expect(again.config.dictation.terms).toEqual(first.config.dictation.terms);
    expect(again.needsBackup).toBe(false);
  });
});
