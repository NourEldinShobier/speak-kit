import { describe, expect, it } from "vite-plus/test";
import { rig, target } from "./fakes";
import {
  applyCorrections,
  confirmCorrections,
  defaultMode,
  editedRegion,
  learnFromField,
  learnFromSelection,
  findHints,
  hintBlock,
  isActive,
  keepsOtherWords,
  learnCorrections,
  MAX_CORRECTIONS,
  remember,
  removeCorrection,
  rewritePass,
  usable,
  type Correction,
  type Rewriter,
  type Settings,
} from "../src";

const fix = (heard: string, correct: string, extra: Partial<Correction> = {}): Correction => ({ id: heard, heard, correct, count: 1, createdAt: 1, confirmed: true, ...extra });
const MEMORY = [fix("cloud code", "Claude Code", { left: "opened", right: "and" }), fix("VS Good", "VS Code", { left: "in" }), fix("get hub", "GitHub", { left: "to" })];

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
});

describe("remembering corrections", () => {
  const now = 100;

  it("a fix seen once and not saved on purpose does not apply yet; seen twice it does", () => {
    const once = remember([], { heard: "cloud code", correct: "Claude Code" }, { now });
    expect(once.map(isActive)).toEqual([false]);
    expect(usable(once, "any.exe")).toEqual([]);
    const twice = remember(once, { heard: "Cloud Code", correct: "Claude Code" }, { now });
    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({ count: 2 });
    expect(usable(twice, "any.exe")).toHaveLength(1);
  });

  it("a fix saved on purpose applies at once", () => {
    const list = remember([], { heard: "cloud code", correct: "Claude Code", left: "opened" }, { now, confirmed: true });
    expect(list).toMatchObject([{ heard: "cloud code", correct: "Claude Code", left: "opened", count: 1, createdAt: 100, confirmed: true }]);
  });

  it("a new fix for the same words in the same place replaces the old one", () => {
    const list = remember(remember([], { heard: "cloud code", correct: "Claude Code" }, { now, confirmed: true }), { heard: "cloud code", correct: "Claude Code CLI" }, { now, confirmed: true });
    expect(list.map((c) => c.correct)).toEqual(["Claude Code CLI"]);
  });

  it("scopes a fix to one program, and the program's name is normalised", () => {
    const list = remember([], { heard: "cloud code", correct: "Claude Code" }, { now, confirmed: true, app: "Slack.exe" });
    expect(usable(list, "slack.exe")).toHaveLength(1);
    expect(usable(list, "Slack.EXE")).toHaveLength(1);
    expect(usable(list, "notepad.exe")).toEqual([]);
    expect(usable(list, undefined)).toEqual([]);
  });

  it("keeps the list at its cap, dropping a fix that is not active first", () => {
    let list: Correction[] = [];
    for (let i = 0; i < MAX_CORRECTIONS; i++) list = remember(list, { heard: `phrase${i}`, correct: `Phrase ${i}` }, { now, confirmed: i > 0 });
    const next = remember(list, { heard: "extra one", correct: "Extra Two" }, { now, confirmed: true });
    expect(next).toHaveLength(MAX_CORRECTIONS);
    expect(next.some((c) => c.heard === "phrase0")).toBe(false);
    expect(next.some((c) => c.heard === "extra one")).toBe(true);
  });

  it("ignores a fix that changes nothing, and deleting a row twice is harmless", () => {
    expect(remember([], { heard: "same", correct: "Same" }, { now })).toEqual([]);
    const list = remember([], { heard: "a b", correct: "ab" }, { now, confirmed: true });
    const id = list[0]!.id;
    expect(removeCorrection(removeCorrection(list, id), id)).toEqual([]);
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

describe("corrections in a dictation", () => {
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
    const r = await heard({ corrections: MEMORY });
    expect(r.ins.inserted[0]?.text).toBe("I opened Claude Code and ran it ");
    expect(await r.dictation.history.list()).toMatchObject([
      { text: "I opened Claude Code and ran it ", raw: "i opened cloud code and ran it", corrected: [{ heard: "cloud code", correct: "Claude Code" }] },
    ]);
  });

  it("leaves the text alone when the fix is not active, is for another program, or the dictation is raw", async () => {
    expect((await heard({ corrections: [fix("cloud code", "Claude Code", { confirmed: false })] })).ins.inserted[0]?.text).toBe("I opened cloud code and ran it ");
    expect((await heard({ corrections: [fix("cloud code", "Claude Code", { app: "slack" })] })).ins.inserted[0]?.text).toBe("I opened cloud code and ran it ");
    expect((await heard({ corrections: [fix("cloud code", "Claude Code", { app: "slack" })] }, "Slack.exe")).ins.inserted[0]?.text).toBe("I opened Claude Code and ran it ");
  });

  it("is done before the writer sees the text, and the writer is told about spellings it did not fix", async () => {
    const seen: { text: string; hints: unknown }[] = [];
    const rewriter: Rewriter = { rewrite: async (req) => (seen.push({ text: req.text, hints: req.hints }), req.text) };
    const chat = { ...defaultMode(), id: "chat", name: "Chat", apps: ["slack"], rewrite: true };
    await said("i opened cloud code then opened clod code")({ modes: [chat], rewrite: { enabled: true }, corrections: MEMORY }, "slack.exe", { rewriter });
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

  it("confirms stored fixes by id", () => {
    const list = remember([], { heard: "cloud code", correct: "Claude Code" }, { now: 1 });
    expect(usable(confirmCorrections(list, [list[0]!.id]), undefined)).toHaveLength(1);
    expect(usable(confirmCorrections(list, ["other"]), undefined)).toEqual([]);
  });
});
