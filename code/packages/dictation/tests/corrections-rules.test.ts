import { describe, expect, it } from "vite-plus/test";
import { applyCorrections, editedRegion, isActive, keepsOtherWords, learnCorrections, remember, usable, type Correction } from "../src";
import { wordsOf } from "../src/corrections/words";

const fix = (heard: string, correct: string, extra: Partial<Correction> = {}): Correction => ({
  id: `${heard}>${correct}${extra.app ?? ""}`,
  heard,
  correct,
  count: 1,
  createdAt: 1,
  confirmed: true,
  ...extra,
});

describe("a fix counts once per dictation", () => {
  const cloud = { heard: "cloud code", correct: "Claude Code" };

  it("seeing the same dictation again does not make a suggestion active", () => {
    const once = remember([], cloud, { now: 1, source: "e1" });
    const twice = remember(once, cloud, { now: 2, source: "e1" });
    expect(twice).toMatchObject([{ count: 1, sources: ["e1"] }]);
    expect(twice.some(isActive)).toBe(false);
  });

  it("a different dictation counts, and the sources are kept to the last five", () => {
    let list = remember([], cloud, { now: 1, source: "e1" });
    for (const id of ["e2", "e3", "e4", "e5", "e6"]) list = remember(list, cloud, { now: 2, source: id });
    expect(list).toMatchObject([{ count: 6, sources: ["e2", "e3", "e4", "e5", "e6"] }]);
    expect(isActive(list[0]!)).toBe(true);
  });

  it("a single word counts again only next to a neighbour it had before", () => {
    const tory = { heard: "tory", correct: "Tauri", left: "use", right: "app" };
    const first = remember([], tory, { now: 1, source: "e1" });
    const elsewhere = remember(first, { ...tory, left: "the", right: "party" }, { now: 2, source: "e2" });
    expect(elsewhere).toMatchObject([{ count: 1, sources: ["e1"] }]);
    expect(elsewhere.some(isActive)).toBe(false);
    const same = remember(first, { ...tory, left: "use", right: "tool" }, { now: 2, source: "e3" });
    expect(same).toMatchObject([{ count: 2 }]);
    expect(same.every(isActive)).toBe(true);
  });

  it("a fix saved on purpose is confirmed by a repeat without being counted twice", () => {
    const first = remember([], cloud, { now: 1, source: "e1" });
    expect(remember(first, cloud, { now: 2, source: "e1", confirmed: true })).toMatchObject([{ count: 1, confirmed: true }]);
  });
});

describe("a new fix for words that already have one", () => {
  const old = fix("cloud code", "Claude Code");

  it("is kept beside an active one when it was only seen, and the active one still applies", () => {
    const list = remember([old], { heard: "cloud code", correct: "Cloud Code Inc" }, { now: 5 });
    expect(list.map((c) => c.correct)).toEqual(["Claude Code", "Cloud Code Inc"]);
    expect(usable(list, undefined).map((c) => c.correct)).toEqual(["Claude Code"]);
  });

  it("replaces an older suggestion, and replaces an active one when it is saved on purpose", () => {
    const suggestion = remember([], { heard: "cloud code", correct: "Cloud Code Inc" }, { now: 1 });
    expect(remember(suggestion, { heard: "cloud code", correct: "Claude Code" }, { now: 2 }).map((c) => c.correct)).toEqual(["Claude Code"]);
    expect(remember([old], { heard: "cloud code", correct: "Cloud Code Inc" }, { now: 2, confirmed: true }).map((c) => c.correct)).toEqual(["Cloud Code Inc"]);
  });

  it("when two apply, the one saved on purpose wins over one that was only seen twice", () => {
    const seenTwice = fix("cloud code", "Cloud Code Inc", { confirmed: false, count: 2 });
    expect(applyCorrections("open cloud code", [seenTwice, old]).text).toBe("open Claude Code");
  });
});

describe("learning grammar edits", () => {
  it.each([
    ["we had a meeting today", "we had a meetings today"],
    ["i work there now", "i worked there now"],
    ["the dog barks loudly", "the dog barking loudly"],
    ["send it quick today", "send it quickly today"],
  ])("learns nothing from %j", (pasted, edited) => {
    expect(learnCorrections(pasted, edited)).toEqual([]);
  });

  it("still learns a respelling that is not an ending, and a word split or joined differently", () => {
    expect(learnCorrections("push it to git hub now", "push it to GitHub now")).toEqual([{ heard: "git hub", correct: "GitHub", left: "to", right: "now" }]);
    expect(learnCorrections("we use kubernetis daily", "we use Kubernetes daily")).toHaveLength(1);
  });

  it("leaves out a neighbour longer than the settings keep", () => {
    const long = "x".repeat(41);
    expect(learnCorrections(`${long} cloud code now`, `${long} Claude Code now`)).toEqual([{ heard: "cloud code", correct: "Claude Code", right: "now" }]);
  });
});

describe("the writer's guard with symbols and contractions", () => {
  const hints = [{ correct: "Claude Code" }];

  it("accepts a Technical answer that joins spoken words into a flag, while a hint is present", () => {
    expect(keepsOtherWords("run dash dash save dev in clod code", "Run --save-dev in Claude Code", hints, "technical")).toBe(true);
    expect(keepsOtherWords("open src slash index dot ts in clod code", "Open src/index.ts in Claude Code", hints, "technical")).toBe(true);
  });

  it("accepts a Formal answer that writes contractions out, while a hint is present", () => {
    expect(keepsOtherWords("i can't open clod code and it's late", "I cannot open Claude Code and it is late.", hints, "formal")).toBe(true);
    expect(keepsOtherWords("we don't use clod code", "We do not use Claude Code.", hints, "formal")).toBe(true);
  });

  it("still refuses unrelated new words, hyphenated or not", () => {
    expect(keepsOtherWords("open clod code now", "Open Claude Code now-ish", hints, "technical")).toBe(false);
    expect(keepsOtherWords("open clod code now", "Open Claude Code, my friend", hints, "technical")).toBe(false);
  });
});

describe("one program before everywhere", () => {
  it("a correction for the program in front beats one for everywhere with the same words", () => {
    const everywhere = fix("cloud code", "Claude Code");
    const here = fix("cloud code", "Claude Code CLI", { app: "slack" });
    expect(applyCorrections("open cloud code", [everywhere, here]).text).toBe("open Claude Code CLI");
    expect(applyCorrections("open cloud code", [here, everywhere]).text).toBe("open Claude Code CLI");
  });
});

describe("text with loose accents", () => {
  const loose = "Café cloud code today";

  it("gives offsets of the text as it is, so a replacement lands on the right words", () => {
    expect(wordsOf(loose).map((w) => [w.text.length, loose.slice(w.start, w.end) === w.text])).toEqual([
      [5, true],
      [5, true],
      [4, true],
      [5, true],
    ]);
    expect(applyCorrections(loose, [fix("cloud code", "Claude Code")]).text).toBe("Café Claude Code today");
  });

  it("compares a loose accent with the composed one", () => {
    expect(wordsOf("Café")[0]!.key).toBe(wordsOf("Café")[0]!.key);
  });
});

describe("a very large field", () => {
  const dictation = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

  it("is not searched for a dictation of more than 200 words, and a long field still gives an answer", () => {
    expect(editedRegion(`${dictation(201)} more`, dictation(201))).toBeUndefined();
    const field = `${"i opened it ".repeat(20_000)}i opened Claude Code and ran the tests`;
    expect(editedRegion(field, "i opened cloud code and ran the tests")).toBe("i opened Claude Code and ran the tests");
  });
});

describe("the capitals of a fix", () => {
  it("keeps a fix with a capital of its own, and capitalises a plain lowercase fix only at the start of a sentence", () => {
    expect(applyCorrections("I phone is here", [fix("i phone", "iPhone")]).text).toBe("iPhone is here");
    expect(applyCorrections("buy an e bay gift", [fix("e bay", "eBay")]).text).toBe("buy an eBay gift");
    const npm = [fix("n p m", "npm")];
    expect(applyCorrections("run N p m now", npm).text).toBe("run npm now");
    expect(applyCorrections("It was fine. N p m is fast.", npm).text).toBe("It was fine. Npm is fast.");
    expect(applyCorrections("N p m is fast", npm).text).toBe("Npm is fast");
  });
});
