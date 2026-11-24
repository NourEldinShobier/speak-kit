import { describe, expect, it } from "vite-plus/test";
import type { Correction } from "@speakkit/dictation";
import { acceptSuggestion, addByHand, checkByHand, countText, HAND_TEXT, fixLabel, saveFixes, scopeText, seenText, statusText, suggestionsFor } from "./model";

const row = (extra: Partial<Correction> = {}): Correction => ({ id: "a", heard: "cloud code", correct: "Claude Code", count: 1, createdAt: 1, ...extra });

describe("corrections list", () => {
  it("words the scope, how often it was seen, and whether it applies yet", () => {
    expect(scopeText(row())).toBe("Everywhere");
    expect(scopeText(row({ app: "slack" }))).toBe("Only in slack");
    expect(seenText(row())).toBe("Seen once");
    expect(seenText(row({ count: 3 }))).toBe("Seen 3 times");
    expect(statusText(row())).toBe("Suggested");
    expect(statusText(row({ confirmed: true }))).toBe("Active");
    expect(statusText(row({ count: 2 }))).toBe("Active");
    expect(countText(3)).toBe("3 of 500 fixes");
  });

  it("makes a suggestion active with one click", () => {
    expect(acceptSuggestion([row(), row({ id: "b" })], "a").map(statusText)).toEqual(["Active", "Suggested"]);
  });
});

describe("fixing a dictation", () => {
  it("lists the fixes in the edited text, and none when the edit is a rewrite", () => {
    const found = suggestionsFor("i opened cloud code and ran it", "i opened Claude Code and ran it");
    expect(found.map(fixLabel)).toEqual(["cloud code → Claude Code"]);
    expect(suggestionsFor("i opened cloud code and ran it", "completely different words here now please")).toEqual([]);
  });

  it("saves the ticked fixes as active ones for every program, or for the program of the entry", () => {
    const fixes = [{ heard: "cloud code", correct: "Claude Code" }];
    expect(saveFixes([], fixes, { now: 5 })).toMatchObject([{ heard: "cloud code", correct: "Claude Code", count: 1, createdAt: 5, confirmed: true }]);
    expect(saveFixes([], fixes, { now: 5 })[0]).not.toHaveProperty("app");
    expect(saveFixes([], fixes, { now: 5, app: "Slack.exe" })[0]).toMatchObject({ app: "slack" });
  });

  it("counts the same history entry once however often it is saved", () => {
    const fixes = [{ heard: "get hub", correct: "GitHub" }];
    const once = saveFixes([], fixes, { now: 1, source: "e1" });
    expect(saveFixes(once, fixes, { now: 2, source: "e1" })).toMatchObject([{ count: 1, sources: ["e1"] }]);
    expect(saveFixes(once, fixes, { now: 2, source: "e2" })).toMatchObject([{ count: 2, sources: ["e1", "e2"] }]);
  });

  it("counts a fix saved again instead of listing it twice", () => {
    const once = saveFixes([], [{ heard: "get hub", correct: "GitHub" }], { now: 1 });
    expect(saveFixes(once, [{ heard: "Get Hub", correct: "GitHub" }], { now: 2 })).toMatchObject([{ heard: "get hub", count: 2 }]);
  });
});

describe("adding a fix by hand", () => {
  it("accepts one to three words that differ from the fix, and blank or long ones wait", () => {
    expect(checkByHand([], "vs good", "VS Code")).toBeUndefined();
    expect(checkByHand([], "", "VS Code")).toBe("empty");
    expect(checkByHand([], "vs good", " ")).toBe("empty");
    expect(checkByHand([], "one two three four", "x")).toBe("too-long");
    expect(checkByHand([], "github", "GitHub")).toBe("same");
  });

  it("accepts a program file name and refuses a name with spaces or a path", () => {
    expect(checkByHand([], "vs good", "VS Code", "code.exe")).toBeUndefined();
    expect(checkByHand([], "vs good", "VS Code", " Code.EXE ")).toBeUndefined();
    expect(checkByHand([], "vs good", "VS Code", "Visual Studio Code")).toBe("app");
    expect(checkByHand([], "vs good", "VS Code", "C:/Apps/code.exe")).toBe("app");
    expect(HAND_TEXT.app).toBe("Use the program file name, such as code.exe.");
  });

  it("refuses a fix when the list is full", () => {
    const full = Array.from({ length: 500 }, (_, i) => row({ id: String(i) }));
    expect(checkByHand(full, "vs good", "VS Code")).toBe("full");
  });

  it("adds it active, scoped when an app is typed", () => {
    expect(addByHand([], { heard: " vs good ", correct: "VS Code", app: " code.exe " }, 7)).toMatchObject([{ heard: "vs good", correct: "VS Code", app: "code", confirmed: true, createdAt: 7 }]);
    expect(addByHand([], { heard: "vs good", correct: "VS Code", app: "  " }, 7)[0]).not.toHaveProperty("app");
  });
});
