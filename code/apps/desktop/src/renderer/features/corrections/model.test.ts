import { describe, expect, it } from "vite-plus/test";
import { fixLabel, keepsAll, limitByDefault, saveFixes, scopeLabel, suggestionsFor } from "./model";

describe("fixing a dictation", () => {
  it("lists the fixes in the edited text, and none when the edit is a rewrite", () => {
    const found = suggestionsFor("i opened cloud code and ran it", "i opened Claude Code and ran it");
    expect(found.map(fixLabel)).toEqual(["cloud code → Claude Code"]);
    expect(suggestionsFor("i opened cloud code and ran it", "completely different words here now please")).toEqual([]);
  });

  it("saves the ticked fixes as words for every program, or for the program of the entry", () => {
    const fixes = [{ heard: "cloud code", correct: "Claude Code" }];
    expect(saveFixes([], fixes, { now: 5 })).toMatchObject([{ word: "Claude Code", soundsLike: ["cloud code"], learned: { heard: "cloud code", count: 1, createdAt: 5 } }]);
    expect(saveFixes([], fixes, { now: 5 })[0]).not.toHaveProperty("app");
    expect(saveFixes([], fixes, { now: 5 })[0]).not.toHaveProperty("suggested");
    expect(saveFixes([], fixes, { now: 5, app: "Slack.exe" })[0]).toMatchObject({ app: "slack" });
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
  it("starts limited to the program only when the heard words are all everyday words", () => {
    expect(limitByDefault([{ heard: "cloud code" }])).toBe(true);
    expect(limitByDefault([{ heard: "their" }])).toBe(true);
    expect(limitByDefault([{ heard: "kubernetis" }])).toBe(false);
    expect(limitByDefault([{ heard: "cloud code" }, { heard: "get hub" }])).toBe(false);
    expect(limitByDefault([])).toBe(false);
  });

  it("names the program in plain words with its file name", () => {
    expect(scopeLabel({ app: "code.exe", appName: "Visual Studio Code" })).toBe("Only when dictating into Visual Studio Code (code.exe)");
    expect(scopeLabel({ app: "code.exe" })).toBe("Only when dictating into code.exe");
    expect(scopeLabel({ app: "code.exe", appName: "code.exe" })).toBe("Only when dictating into code.exe");
  });
});
