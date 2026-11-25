import { describe, expect, it } from "vite-plus/test";
import { rig, target } from "./fakes";
import {
  acceptSuggestions,
  activeFixes,
  applyCorrections,
  defaultMode,
  editedRegion,
  learnFromField,
  learnFromSelection,
  findHints,
  hintBlock,
  hintFixes,
  keepsOtherWords,
  learnCorrections,
  MAX_SOUNDS,
  MAX_TERMS,
  remember,
  removeTerm,
  rewritePass,
  saveFix,
  type Fix,
  type Rewriter,
  type Settings,
  type Term,
} from "../src";

const fix = (heard: string, correct: string, extra: Partial<Fix> = {}): Fix => ({ heard, correct, ...extra });
const MEMORY = [fix("cloud code", "Claude Code", { left: "opened", right: "and" }), fix("VS Good", "VS Code", { left: "in" }), fix("get hub", "GitHub", { left: "to" })];

/** A word learned from a fix: saved, or a suggestion seen `count` times; `app` limits it to a program. */
const learned = (heard: string, correct: string, extra: { left?: string; right?: string; app?: string; suggested?: boolean; count?: number } = {}): Term => ({
  id: heard,
  word: correct,
  soundsLike: [heard],
  ...(extra.app && { app: extra.app }),
  ...(extra.suggested && { suggested: true }),
  learned: { heard, count: extra.count ?? 1, createdAt: 1, ...(extra.left && { left: extra.left }), ...(extra.right && { right: extra.right }) },
});
const MEMORY_TERMS = MEMORY.map((m) => learned(m.heard, m.correct, { ...(m.left && { left: m.left }), ...(m.right && { right: m.right }) }));

describe("learning a correction from an edit", () => {
  it("takes a phrase the person retyped, with the words around it", () => {
    expect(learnCorrections("i opened cloud code and ran the tests", "i opened Claude Code and ran the tests")).toEqual([
      { heard: "cloud code", correct: "Claude Code", left: "opened", right: "and" },
    ]);
  });

  it("widens a single short word to a phrase so it is never a global rule", () => {
    expect(learnCorrections("open it in VS Good then commit", "open it in VS Code then commit")).toEqual([{ heard: "VS Good", correct: "VS Code", left: "in", right: "then" }]);
  });

  it("accepts two words that became one", () => {
    expect(learnCorrections("push it to get hub", "push it to GitHub")).toEqual([{ heard: "get hub", correct: "GitHub", left: "to" }]);
  });

  it("accepts a single swapped word that is long enough to stand alone", () => {
    expect(learnCorrections("we deployed with kubernetes yesterday", "we deployed with Kubernetes yesterday")).toEqual([]);
    expect(learnCorrections("we deployed with kubernetis yesterday", "we deployed with Kubernetes yesterday")).toEqual([
      { heard: "kubernetis", correct: "Kubernetes", left: "with", right: "yesterday" },
    ]);
  });

  it("takes each of two separate fixes", () => {
    const got = learnCorrections("i opened cloud code and then pushed to get hub", "i opened Claude Code and then pushed to GitHub");
    expect(got.map((c) => `${c.heard}>${c.correct}`)).toEqual(["cloud code>Claude Code", "get hub>GitHub"]);
  });

  it.each([
    ["a rewrite", "we should meet tomorrow to discuss the budget", "Let us talk on Friday about money"],
    ["a changed figure", "the price is 15 dollars today", "the price is 50 dollars today"],
    ["a synonym", "send the big file now", "send the large file now"],
    ["a swap of function words", "i went to there house", "i went to their house"],
    ["a capital letter only", "i use github daily", "i use GitHub daily"],
    ["a link", "open example.com now please", "open example.org now please"],
    ["an added word", "ship it today", "ship it today please"],
    ["a removed word", "ship it today please", "ship it today"],
    ["nothing", "ship it today", "ship it today"],
    ["a different word of similar length", "meet me on monday morning", "meet me on friday morning"],
  ])("gives nothing for %s", (_, pasted, edited) => {
    expect(learnCorrections(pasted, edited)).toEqual([]);
  });

  it("gives nothing when more than half of the words changed", () => {
    expect(learnCorrections("cloud code works", "Claude Cody walks")).toEqual([]);
  });

  it("gives nothing for an edit in more than three places", () => {
    expect(learnCorrections("cloud code and get hub and vs good and clod node and more", "Claude Code and GitHub and VS Code and Claude Node and more")).toEqual([]);
  });

  it("takes any new word when the person edits by hand, but still not a rewrite or a change of capitals", () => {
    const hand = (pasted: string, edited: string) => learnCorrections(pasted, edited, true).map((c) => [c.heard, c.correct]);
    expect(hand("Can you open the HTML file?", "Can you read the HTML file?")).toEqual([["open", "read"]]);
    expect(hand("send it to bob today", "send it to alice today")).toEqual([["bob", "alice"]]);
    expect(hand("In cloud code", "In Claude Code")).toEqual([["cloud code", "Claude Code"]]);
    expect(hand("I opened Cloud Code and BS Code now", "I opened Claude Code and VS Code now")).toEqual([
      ["Cloud", "Claude"],
      ["BS", "VS"],
    ]);
    expect(hand("Can you open the HTML file?", "Can you open the html file?")).toEqual([]);
    expect(hand("Can you open the HTML file?", "Can you open the HTML  file ?")).toEqual([]);
    expect(hand("it costs 15 dollars today", "it costs 50 dollars today")).toEqual([]);
    expect(hand("open the big red door now", "close that small blue window later")).toEqual([]);
    expect(learnCorrections("Can you open the HTML file?", "Can you read the HTML file?")).toEqual([]);
  });
});

describe("remembering fixes as words", () => {
  const now = 100;
  const heardAs = (list: Term[]) => list.map((t) => [t.word, t.soundsLike]);

  it("a fix seen once and not saved on purpose is a suggestion that does not apply yet; seen twice it does", () => {
    const once = remember([], { heard: "cloud code", correct: "Claude Code" }, { now });
    expect(once).toMatchObject([{ word: "Claude Code", soundsLike: ["cloud code"], suggested: true, learned: { heard: "cloud code", count: 1 } }]);
    expect(activeFixes(once, "any.exe")).toEqual([]);
    const twice = remember(once, { heard: "Cloud Code", correct: "Claude Code" }, { now });
    expect(twice).toHaveLength(1);
    expect(twice[0]?.learned?.count).toBe(2);
    expect(activeFixes(twice, "any.exe")).toEqual([{ heard: "cloud code", correct: "Claude Code" }]);
  });

  it("a fix saved on purpose is a saved word that applies at once", () => {
    const list = remember([], { heard: "cloud code", correct: "Claude Code", left: "opened" }, { now, confirmed: true });
    expect(list).toMatchObject([{ word: "Claude Code", soundsLike: ["cloud code"], learned: { heard: "cloud code", left: "opened", count: 1, createdAt: 100 } }]);
    expect(list[0]?.suggested).toBeUndefined();
  });

  it("a fix saved on purpose for a word that is in the list adds its spelling to that word", () => {
    const base: Term[] = [{ id: "w", word: "Claude Code", soundsLike: ["clawd code"] }];
    expect(heardAs(remember(base, { heard: "cloud code", correct: "Claude Code" }, { now, confirmed: true }))).toEqual([["Claude Code", ["clawd code", "cloud code"]]]);
    expect(remember(base, { heard: "Clawd Code", correct: "Claude Code" }, { now, confirmed: true })).toEqual(base);
  });

  it("a new fix for the same words in the same place takes the spelling from the old one", () => {
    const list = remember(remember([], { heard: "cloud code", correct: "Claude Code" }, { now, confirmed: true }), { heard: "cloud code", correct: "Claude Code CLI" }, { now, confirmed: true });
    expect(heardAs(list)).toEqual([
      ["Claude Code", []],
      ["Claude Code CLI", ["cloud code"]],
    ]);
  });

  it("a suggestion is replaced by a fix saved on purpose for the same words", () => {
    const list = remember(remember([], { heard: "cloud code", correct: "Claude" }, { now }), { heard: "cloud code", correct: "Claude Code" }, { now, confirmed: true });
    expect(heardAs(list)).toEqual([["Claude Code", ["cloud code"]]]);
  });

  it("scopes a fix to one program, and the program's name is normalised", () => {
    const list = remember([], { heard: "cloud code", correct: "Claude Code" }, { now, confirmed: true, app: "Slack.exe" });
    expect(activeFixes(list, "slack.exe")).toHaveLength(1);
    expect(activeFixes(list, "Slack.EXE")).toHaveLength(1);
    expect(activeFixes(list, "notepad.exe")).toEqual([]);
    expect(activeFixes(list, undefined)).toEqual([]);
  });

  it("keeps the list at its cap, dropping a suggestion first, and adds nothing when there is none to drop", () => {
    let list: Term[] = [];
    for (let i = 0; i < MAX_TERMS; i++) list = remember(list, { heard: `phrase${i}`, correct: `Phrase ${i}` }, { now, confirmed: i > 0 });
    const next = remember(list, { heard: "extra one", correct: "Extra Two" }, { now, confirmed: true });
    expect(next).toHaveLength(MAX_TERMS);
    expect(next.some((t) => t.soundsLike.includes("phrase0"))).toBe(false);
    expect(next.some((t) => t.soundsLike.includes("extra one"))).toBe(true);
    expect(remember(next, { heard: "one more", correct: "One More" }, { now, confirmed: true })).toEqual(next);
  });

  it("ignores a fix that changes nothing, and deleting a row twice is harmless", () => {
    expect(remember([], { heard: "same", correct: "Same" }, { now })).toEqual([]);
    const list = remember([], { heard: "a b", correct: "ab" }, { now, confirmed: true });
    const id = list[0]!.id;
    expect(removeTerm(removeTerm(list, id), id)).toEqual([]);
  });

  it("counts one dictation once, and a single word only next to the same neighbour", () => {
    const once = remember([], { heard: "cloud code", correct: "Claude Code" }, { now, source: "h1" });
    expect(remember(once, { heard: "cloud code", correct: "Claude Code" }, { now, source: "h1" })[0]?.learned?.count).toBe(1);
    expect(remember(once, { heard: "cloud code", correct: "Claude Code" }, { now, source: "h2" })[0]?.learned).toMatchObject({ count: 2, sources: ["h1", "h2"] });
    const word = remember([], { heard: "kubernetis", correct: "Kubernetes", left: "with" }, { now });
    expect(remember(word, { heard: "kubernetis", correct: "Kubernetes", left: "on" }, { now })[0]?.learned?.count).toBe(1);
    expect(remember(word, { heard: "kubernetis", correct: "Kubernetes", left: "with" }, { now })[0]?.learned?.count).toBe(2);
  });

  it("uses a suggestion: it becomes a saved word, or joins the word it is for", () => {
    const suggestion = remember([], { heard: "cloud code", correct: "Claude Code" }, { now });
    const used = acceptSuggestions(suggestion, [suggestion[0]!.id]);
    expect(used).toMatchObject([{ word: "Claude Code", soundsLike: ["cloud code"] }]);
    expect(used[0]?.suggested).toBeUndefined();
    const own: Term = { id: "w", word: "Claude Code", soundsLike: [] };
    expect(heardAs(acceptSuggestions([own, ...suggestion], [suggestion[0]!.id]))).toEqual([["Claude Code", ["cloud code"]]]);
    expect(acceptSuggestions(suggestion, ["other"])).toEqual(suggestion);
  });

  it("a fix saved on purpose joins the saved word instead of making a second saved entry, and takes the spelling from the other word", () => {
    const own: Term = { id: "w", word: "Claude Code", soundsLike: [] };
    const other: Term = { id: "o", word: "Cloud", soundsLike: ["cloud code"] };
    const suggestion = remember([own, other], { heard: "cloud code", correct: "Claude Code" }, { now });
    expect(suggestion.filter((t) => t.suggested)).toHaveLength(1);
    expect(heardAs(remember(suggestion, { heard: "cloud code", correct: "Claude Code" }, { now, confirmed: true }))).toEqual([
      ["Claude Code", ["cloud code"]],
      ["Cloud", []],
    ]);
  });

  it("a suggestion alone becomes a saved word and takes its spelling from another word", () => {
    const other: Term = { id: "o", word: "Cloud", soundsLike: ["cloud code"] };
    const suggestion = remember([other], { heard: "cloud code", correct: "Claude Code" }, { now });
    expect(heardAs(remember(suggestion, { heard: "cloud code", correct: "Claude Code" }, { now, confirmed: true }))).toEqual([
      ["Cloud", []],
      ["Claude Code", ["cloud code"]],
    ]);
  });

  it("a fix whose spelling was removed from its word puts the spelling back", () => {
    const saved = remember([], { heard: "cloud code", correct: "Claude Code" }, { now, confirmed: true });
    const trimmed = saved.map((t) => ({ ...t, soundsLike: [] }));
    expect(heardAs(remember(trimmed, { heard: "cloud code", correct: "Claude Code" }, { now, confirmed: true }))).toEqual([["Claude Code", ["cloud code"]]]);
  });

  it("keeps a suggestion when the word it is for has the most spellings", () => {
    const own: Term = { id: "w", word: "Claude Code", soundsLike: Array.from({ length: MAX_SOUNDS }, (_, i) => `spelling ${i}`) };
    const suggestion = remember([own], { heard: "cloud code", correct: "Claude Code" }, { now });
    expect(acceptSuggestions(suggestion, [suggestion[1]!.id])).toEqual(suggestion);
  });
});

describe("saving a fix on purpose", () => {
  const now = 5;
  const shown = (list: Term[]) => list.map((t) => [t.word, t.soundsLike, t.app, !!t.suggested, !!t.learned]);

  it("limits a fix of everyday words to the program it was made in, and applies it at once", () => {
    const list = saveFix([], { heard: "cloud code", correct: "Claude Code" }, { now, app: "Code.exe", source: "e1" });
    expect(shown(list)).toEqual([["Claude Code", ["cloud code"], "code", false, true]]);
    expect(activeFixes(list, "code.exe")).toHaveLength(1);
  });

  it("keeps a fix of distinctive words for every program", () => {
    expect(shown(saveFix([], { heard: "kubernetis", correct: "Kubernetes" }, { now, app: "Code.exe" }))).toEqual([["Kubernetes", ["kubernetis"], undefined, false, true]]);
    expect(shown(saveFix([], { heard: "cloud code", correct: "Claude Code" }, { now }))).toEqual([["Claude Code", ["cloud code"], undefined, false, true]]);
  });

  it("widens an app fix to every program when it is saved from another program", () => {
    const once = saveFix([], { heard: "cloud code", correct: "Claude Code" }, { now, app: "code.exe", source: "e1" });
    const twice = saveFix(once, { heard: "cloud code", correct: "Claude Code" }, { now, app: "slack.exe", source: "e2" });
    expect(shown(twice)).toEqual([["Claude Code", ["cloud code"], undefined, false, true]]);
  });

  it("keeps the fix for its program when it is saved again from the same program", () => {
    const once = saveFix([], { heard: "cloud code", correct: "Claude Code" }, { now, app: "code.exe", source: "e1" });
    expect(shown(saveFix(once, { heard: "cloud code", correct: "Claude Code" }, { now, app: "Code.exe", source: "e2" }))).toEqual([["Claude Code", ["cloud code"], "code", false, true]]);
  });

  it("widens a spelling added to a program entry when it is saved from another program", () => {
    const first = saveFix([], { heard: "cloud code", correct: "Claude Code" }, { now, app: "code.exe", source: "e1" });
    const both = saveFix(first, { heard: "clawed code", correct: "Claude Code" }, { now, app: "code.exe", source: "e2" });
    const wide = saveFix(both, { heard: "clawed code", correct: "Claude Code" }, { now, app: "slack.exe", source: "e3" });
    expect(shown(wide)).toEqual([
      ["Claude Code", ["cloud code"], "code", false, true],
      ["Claude Code", ["clawed code"], undefined, false, true],
    ]);
  });

  it("widens only the fix, not the other spellings the program entry has", () => {
    const own: Term = { id: "w", word: "Claude Code", soundsLike: ["clawd code"], app: "code" };
    const once = saveFix([own], { heard: "cloud code", correct: "Claude Code" }, { now, app: "code.exe" });
    const wide = saveFix(once, { heard: "cloud code", correct: "Claude Code" }, { now, app: "slack.exe" });
    expect(shown(wide)).toEqual([
      ["Claude Code", ["clawd code"], "code", false, false],
      ["Claude Code", ["cloud code"], undefined, false, true],
    ]);
  });
});

describe("the fixes a list of words gives the apply stage and the writer", () => {
  it("gives the spelling that was learned to the apply stage, and every spelling to the writer with the neighbours it was learned with", () => {
    const word: Term = { ...learned("cloud code", "Claude Code", { left: "opened" }), soundsLike: ["cloud code", "clawd code"] };
    expect(activeFixes([word], undefined)).toEqual([{ heard: "cloud code", correct: "Claude Code", confirmed: true }]);
    expect(hintFixes([word], undefined)).toEqual([
      { heard: "cloud code", correct: "Claude Code", left: "opened" },
      { heard: "clawd code", correct: "Claude Code" },
    ]);
  });

  it("leaves out entries that remove text, suggestions seen once, and entries for another program", () => {
    const list = [{ id: "r", word: "um", soundsLike: ["er"], remove: true }, learned("cloud code", "Claude Code", { suggested: true }), learned("get hub", "GitHub", { app: "slack" })];
    expect(hintFixes(list, "notepad.exe")).toEqual([]);
    expect(hintFixes(list, "Slack.exe")).toEqual([{ heard: "get hub", correct: "GitHub" }]);
  });
});

describe("applying corrections", () => {
  const run = (text: string, list = MEMORY) => applyCorrections(text, list).text;

  it("replaces a misheard phrase and keeps the rest", () => {
    expect(run("i opened cloud code and ran the tests ")).toBe("i opened Claude Code and ran the tests ");
    expect(run("open it in vs good then commit")).toBe("open it in VS Code then commit");
    expect(run("push it to get hub")).toBe("push it to GitHub");
  });

  it("leaves text that only shares a word with the phrase", () => {
    expect(run("the cloud storage is full")).toBe("the cloud storage is full");
    expect(run("cloud, code and a good idea")).toBe("cloud, code and a good idea");
    expect(run("a cloud\ncode sample")).toBe("a cloud\ncode sample");
    expect(run("my cloudcode and cloud codes")).toBe("my cloudcode and cloud codes");
  });

  it("is idempotent", () => {
    const once = run("i opened cloud code and ran it");
    expect(run(once)).toBe(once);
    const extend = [fix("code", "Claude Code")];
    expect(run("use Claude Code now", extend)).toBe("use Claude Code now");
    expect(run(run("use code now", extend), extend)).toBe("use Claude Code now");
  });

  it("writes the fix the way the text is written", () => {
    expect(run("Cloud code is open")).toBe("Claude Code is open");
    expect(run("CLOUD CODE IS OPEN")).toBe("CLAUDE CODE IS OPEN");
    expect(run("use it", [fix("it", "claude code")])).toBe("use claude code");
    expect(run("It works", [fix("it", "claude code")])).toBe("Claude code works");
  });

  it("tells what it changed", () => {
    expect(applyCorrections("cloud code and get hub", MEMORY).applied).toEqual([
      { heard: "cloud code", correct: "Claude Code" },
      { heard: "get hub", correct: "GitHub" },
    ]);
  });

  it("changes at most five places in one dictation", () => {
    const text = "get hub get hub get hub get hub get hub get hub get hub";
    expect(run(text)).toBe("GitHub GitHub GitHub GitHub GitHub get hub get hub");
  });

  it("prefers the longer phrase where two overlap", () => {
    const list = [fix("cloud", "Claude"), fix("cloud code", "Claude Code")];
    expect(run("open cloud code", list)).toBe("open Claude Code");
  });
});

describe("finding misheard spots that are spelled differently", () => {
  const spots = (text: string, list = MEMORY) => findHints(text, list).map((h) => `${h.heard}>${h.correct}`);

  it("offers a variant of the stored phrase when a neighbour matches", () => {
    expect(spots("i opened clod code and ran it")).toEqual(["clod code>Claude Code"]);
  });

  it("offers a variant that is long and close with no neighbour at all", () => {
    expect(spots("we use clawed codes daily", [fix("claude codes", "Claude Code")])).toEqual(["clawed codes>Claude Code"]);
    expect(spots("we use kubernetis daily", [fix("kubernetes", "Kubernetes")])).toEqual(["kubernetis>Kubernetes"]);
  });

  it("does not offer unrelated words, short phrases or the exact phrase", () => {
    expect(spots("the cloud storage is full")).toEqual([]);
    expect(spots("i opened cloud code and ran it")).toEqual([]);
    expect(spots("push it to get started", [fix("get hub", "GitHub", { left: "to" })])).toEqual([]);
    expect(spots("it was a good code", [fix("VS Good", "VS Code")])).toEqual([]);
  });

  it("does not offer a plain-word variant without a neighbour from the time of learning", () => {
    expect(spots("so clod code works", [fix("cloud code", "Claude Code", { left: "opened" })])).toEqual([]);
  });

  it("offers a plain-word variant of a phrase with no neighbours on record only when it is all but the same", () => {
    expect(spots("so clod code works", [fix("cloud code", "Claude Code")])).toEqual(["clod code>Claude Code"]);
    expect(spots("so clawed codes works", [fix("cloud code", "Claude Code")])).toEqual([]);
  });

  it("caps the list and keeps the spots apart", () => {
    const text = Array.from({ length: 14 }, () => "kubernetis").join(" ");
    expect(findHints(text, [fix("kubernetes", "Kubernetes")])).toHaveLength(10);
  });

  it("words the hint for the writer", () => {
    expect(hintBlock([])).toBe("");
    expect(
      hintBlock([
        { heard: "clod code", correct: "Claude Code" },
        { heard: "get hug", correct: "GitHub" },
      ]),
    ).toBe('These words may have been misheard; fix them only where they clearly fit: heard "clod code" may be "Claude Code"; heard "get hug" may be "GitHub".');
  });
});

describe("keeping the writer to the misheard spots", () => {
  const hints = [{ correct: "Claude Code" }];

  it("allows the fix and punctuation", () => {
    expect(keepsOtherWords("i opened clod code and ran it", "I opened Claude Code and ran it.", hints, "exact")).toBe(true);
  });

  it("refuses new words elsewhere under a template that keeps the speaker's words", () => {
    expect(keepsOtherWords("i opened clod code and ran it", "I started Claude Code and ran it.", hints, "exact")).toBe(false);
    expect(keepsOtherWords("i opened clod code and ran it", "I started Claude Code and ran it.", hints, "tidy")).toBe(true);
  });

  it("refuses a rewrite under any template", () => {
    expect(keepsOtherWords("i opened clod code and ran it", "Yesterday afternoon I launched Claude Code, executed everything, and celebrated.", hints, "tidy")).toBe(false);
  });
});

describe("the rewrite pass with misheard spots", () => {
  const skip = new AbortController().signal;
  const writer = (answer: string): Rewriter & { seen: unknown[] } => {
    const seen: unknown[] = [];
    return { seen, rewrite: async (req) => (seen.push(req.hints), answer) };
  };

  it("passes the spots to the writer and takes the fixed text", async () => {
    const rw = writer("I opened Claude Code and ran it.");
    const hints = findHints("i opened clod code and ran it", MEMORY);
    expect(await rewritePass({ text: "i opened clod code and ran it", rewriter: rw, skip, hints })).toEqual({ text: "I opened Claude Code and ran it.", outcome: "rewritten" });
    expect(rw.seen).toEqual([hints]);
  });

  it("sends no hints when there are none", async () => {
    const rw = writer("Hello.");
    await rewritePass({ text: "hello", rewriter: rw, skip, hints: [] });
    expect(rw.seen).toEqual([undefined]);
  });

  it("falls back to the text as said when the writer changes words elsewhere", async () => {
    const rw = writer("Yesterday afternoon I launched Claude Code, executed everything, and celebrated.");
    const hints = findHints("i opened clod code and ran it", MEMORY);
    expect(await rewritePass({ text: "i opened clod code and ran it", rewriter: rw, skip, hints })).toEqual({ text: "i opened clod code and ran it", outcome: "changed-words" });
  });
});

describe("learned fixes in a dictation", () => {
  const said =
    (text: string) =>
    async (settings: Partial<Settings>, exe = "notepad.exe", extra?: { rewriter?: Rewriter }) => {
      const r = await rig(settings, undefined, extra);
      r.ins.state.current = target({ exe });
      r.stt.state.result = { ok: true, text };
      await r.hold(1000);
      await r.time.advance(200);
      return r;
    };
  const heard = said("i opened cloud code and ran it");

  it("swaps the misheard phrase before inserting and writes the change in the history", async () => {
    const r = await heard({ terms: MEMORY_TERMS });
    expect(r.ins.inserted[0]?.text).toBe("I opened Claude Code and ran it ");
    expect(await r.dictation.history.list()).toMatchObject([
      { text: "I opened Claude Code and ran it ", raw: "i opened cloud code and ran it", corrected: [{ heard: "cloud code", correct: "Claude Code" }] },
    ]);
  });

  it("leaves the text alone when the fix is not active, is for another program, or the dictation is raw", async () => {
    expect((await heard({ terms: [learned("cloud code", "Claude Code", { suggested: true })] })).ins.inserted[0]?.text).toBe("I opened cloud code and ran it ");
    expect((await heard({ terms: [learned("cloud code", "Claude Code", { app: "slack" })] })).ins.inserted[0]?.text).toBe("I opened cloud code and ran it ");
    expect((await heard({ terms: [learned("cloud code", "Claude Code", { app: "slack" })] }, "Slack.exe")).ins.inserted[0]?.text).toBe("I opened Claude Code and ran it ");
    expect((await heard({ terms: [learned("cloud code", "Claude Code", { suggested: true, count: 2 })] })).ins.inserted[0]?.text).toBe("I opened Claude Code and ran it ");
  });

  it("is done before the writer sees the text, and the writer is told about spellings it did not fix", async () => {
    const seen: { text: string; hints: unknown }[] = [];
    const rewriter: Rewriter = { rewrite: async (req) => (seen.push({ text: req.text, hints: req.hints }), req.text) };
    const chat = { ...defaultMode(), id: "chat", name: "Chat", apps: ["slack"], rewrite: true };
    await said("i opened cloud code then opened clod code")({ modes: [chat], rewrite: { enabled: true }, terms: MEMORY_TERMS }, "slack.exe", { rewriter });
    expect(seen).toEqual([{ text: "I opened Claude Code then opened clod code", hints: [{ heard: "clod code", correct: "Claude Code", start: 33, end: 42 }] }]);
  });
});

describe("learning from the text around a dictation", () => {
  const pasted = "i opened cloud code and ran the tests";

  it("finds the edited dictation inside a field with other text", () => {
    const field = "Notes for today\n\nI opened Claude Code and ran the tests\n\nMore below";
    expect(editedRegion(field, pasted)).toBe("I opened Claude Code and ran the tests");
    expect(learnFromField(pasted, field)).toEqual([{ heard: "cloud code", correct: "Claude Code", left: "opened", right: "and" }]);
  });

  it("finds it when the first and the last words were the ones fixed", () => {
    expect(learnFromField("cloud code is open now and get hub", "Claude Code is open now and GitHub")).toEqual([
      { heard: "cloud code", correct: "Claude Code", right: "is" },
      { heard: "get hub", correct: "GitHub", left: "and" },
    ]);
  });

  it("says the text is missing when the field does not hold it, and finds no fix when nothing changed", () => {
    expect(learnFromField(pasted, "something else entirely, nothing alike")).toBeUndefined();
    expect(learnFromField(pasted, `x ${pasted} y`)).toEqual([]);
  });

  it("learns from a selection that is the whole text or only the edited sentence", () => {
    expect(learnFromSelection(pasted, "I opened Claude Code and ran the tests")).toHaveLength(1);
    const two = "we met at noon. i opened cloud code and ran the tests. then we left";
    expect(learnFromSelection(two, "I opened Claude Code and ran the tests.")).toEqual([{ heard: "cloud code", correct: "Claude Code", left: "opened", right: "and" }]);
    expect(learnFromSelection(pasted, "unrelated words")).toEqual([]);
  });
});
