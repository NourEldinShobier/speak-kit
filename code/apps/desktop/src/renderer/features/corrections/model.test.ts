import { describe, expect, it } from "vite-plus/test";
import { fixLabel, keepsAll, saveFixes, suggestionsFor } from "./model";

describe("fixing a dictation", () => {
  it("lists the fixes in the edited text, and none when the edit is a rewrite", () => {
    const found = suggestionsFor("i opened cloud code and ran it", "i opened Claude Code and ran it");
    expect(found.map(fixLabel)).toEqual(["cloud code → Claude Code"]);
    expect(suggestionsFor("i opened cloud code and ran it", "completely different words here now please")).toEqual([]);
    const said = "I honestly love to play with Claude and VS good.";
    for (const edited of ["VS Code.", "VS Cod."]) expect(suggestionsFor(said, said.replace("VS good.", edited)).map(fixLabel)).toEqual([`VS good → ${edited.slice(0, -1)}`]);
  });

  it("saves the fixes as words that apply at once", () => {
    const fixes = [{ heard: "cloud code", correct: "Claude Code" }];
    expect(saveFixes([], fixes, { now: 5 })).toMatchObject([{ word: "Claude Code", soundsLike: ["cloud code"], learned: { heard: "cloud code", count: 1, createdAt: 5 } }]);
    expect(saveFixes([], fixes, { now: 5 })[0]).not.toHaveProperty("suggested");
  });

  it("adds the heard words to the word that is in the list", () => {
    const list = [{ id: "w", word: "Claude Code", soundsLike: ["clawd code"] }];
    expect(saveFixes(list, [{ heard: "cloud code", correct: "Claude Code" }], { now: 1 })).toMatchObject([{ id: "w", soundsLike: ["clawd code", "cloud code"] }]);
  });

  it("says when a fix could not be kept: a full list, or a word with the most spellings", () => {
    const fixes = [{ heard: "cloud code", correct: "Claude Code" }];
    expect(keepsAll(saveFixes([], fixes, { now: 1 }), fixes)).toBe(true);
    const full = Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, word: `word${i}`, soundsLike: [] }));
    expect(keepsAll(saveFixes(full, fixes, { now: 1 }), fixes)).toBe(false);
    const spellings = Array.from({ length: 20 }, (_, i) => `spelling ${i}`);
    const crowded = [{ id: "w", word: "Claude Code", soundsLike: spellings }];
    expect(keepsAll(saveFixes(crowded, fixes, { now: 1 }), fixes)).toBe(false);
  });

  it("counts the same history entry once however often it is saved", () => {
    const fixes = [{ heard: "get hub", correct: "GitHub" }];
    const once = saveFixes([], fixes, { now: 1, source: "e1" });
    expect(saveFixes(once, fixes, { now: 2, source: "e1" })).toMatchObject([{ learned: { count: 1, sources: ["e1"] } }]);
    expect(saveFixes(once, fixes, { now: 2, source: "e2" })).toMatchObject([{ learned: { count: 2, sources: ["e1", "e2"] } }]);
  });
});

describe("where a fix applies", () => {
  const apps = (list: ReturnType<typeof saveFixes>) => list.map((t) => [t.word, t.app]);

  it("limits each fix to the program only when its heard words are all everyday words", () => {
    const fixes = [
      { heard: "cloud code", correct: "Claude Code" },
      { heard: "kubernetis", correct: "Kubernetes" },
    ];
    expect(apps(saveFixes([], fixes, { now: 1, app: "Slack.exe" }))).toEqual([
      ["Claude Code", "slack"],
      ["Kubernetes", undefined],
    ]);
    expect(apps(saveFixes([], fixes, { now: 1 }))).toEqual([
      ["Claude Code", undefined],
      ["Kubernetes", undefined],
    ]);
  });

  it("widens a fix to every program when it is saved from another program", () => {
    const fixes = [{ heard: "cloud code", correct: "Claude Code" }];
    const first = saveFixes([], fixes, { now: 1, app: "code.exe", source: "e1" });
    expect(apps(first)).toEqual([["Claude Code", "code"]]);
    expect(apps(saveFixes(first, fixes, { now: 2, app: "slack.exe", source: "e2" }))).toEqual([["Claude Code", undefined]]);
  });
});
