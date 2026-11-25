import { describe, expect, it } from "vite-plus/test";
import { activeFixes, isActive, type Term } from "@speakkit/dictation";
import { CorrectionLearner, learnFromWindow, RECENT_MS, type WindowPorts } from "./learn-correction";
import { isTerminal, TERMINALS } from "./terminals";

const NOW = 10_000_000;
const SAID = "i opened cloud code and ran the tests";
const FIXED = "I opened Claude Code and ran the tests";

function ports(over: Partial<WindowPorts> = {}) {
  const reads: string[] = [];
  const p: WindowPorts = {
    last: async () => ({ id: "e1", text: SAID, at: NOW - 60_000 }),
    foreground: () => ({ elevated: false, exe: "notepad.exe" }),
    passwordFocused: () => false,
    readValue: async () => (reads.push("value"), { text: `Notes\n${FIXED}\nmore` }),
    selection: async () => (reads.push("selection"), FIXED),
    ...over,
  };
  return { p, reads };
}

describe("reading the window after a fix", () => {
  it("takes the fix from the focused field's text, and names the dictation it came from", async () => {
    const { p, reads } = ports();
    expect(await learnFromWindow(p, NOW)).toEqual({ fixes: [{ heard: "cloud code", correct: "Claude Code", left: "opened", right: "and" }], source: "e1" });
    expect(reads).toEqual(["value"]);
  });

  it("copies the selection when the field cannot be read, or does not hold the dictation", async () => {
    const unreadable = ports({ readValue: async () => undefined });
    expect(await learnFromWindow(unreadable.p, NOW)).toMatchObject({ fixes: [{ heard: "cloud code" }] });
    expect(unreadable.reads).toEqual(["selection"]);
    const elsewhere = ports({ readValue: async () => ({ text: "something else entirely" }) });
    expect(await learnFromWindow(elsewhere.p, NOW)).toMatchObject({ fixes: [{ heard: "cloud code" }] });
    expect(elsewhere.reads).toEqual(["selection"]);
  });

  it("reads nothing in a password field or a program with higher rights", async () => {
    const secret = ports({ passwordFocused: () => true });
    expect(await learnFromWindow(secret.p, NOW)).toEqual({ none: "refused" });
    const admin = ports({ foreground: () => ({ elevated: true, exe: "notepad.exe" }) });
    expect(await learnFromWindow(admin.p, NOW)).toEqual({ none: "refused" });
    const unknown = ports({ foreground: () => null });
    expect(await learnFromWindow(unknown.p, NOW)).toEqual({ none: "refused" });
    expect([...secret.reads, ...admin.reads, ...unknown.reads]).toEqual([]);
  });

  it("stops at a password verdict of the field read and never copies the selection", async () => {
    const reads: string[] = [];
    const secret = ports({ readValue: async () => ({ password: true }), selection: async () => (reads.push("selection"), "hunter2") });
    expect(await learnFromWindow(secret.p, NOW)).toEqual({ none: "refused" });
    expect(reads).toEqual([]);
  });

  it("never sends the copy key into a terminal, and says so", async () => {
    for (const exe of ["WindowsTerminal.exe", "pwsh.exe", "cmd.exe", "com.apple.Terminal", "ghostty"]) {
      const t = ports({ foreground: () => ({ elevated: false, exe }), readValue: async () => undefined });
      expect(await learnFromWindow(t.p, NOW)).toEqual({ none: "terminal" });
      expect(t.reads, exe).toEqual([]);
    }
  });

  it("still reads a terminal's field when it holds the dictation, and a program with no name is treated as a terminal", async () => {
    const t = ports({ foreground: () => ({ elevated: false, exe: "wt.exe" }) });
    expect(await learnFromWindow(t.p, NOW)).toMatchObject({ fixes: [{ heard: "cloud code" }] });
    const noName = ports({ foreground: () => ({ elevated: false, exe: null }), readValue: async () => undefined });
    expect(await learnFromWindow(noName.p, NOW)).toEqual({ none: "terminal" });
  });

  it("needs a dictation from the last ten minutes", async () => {
    expect(await learnFromWindow(ports({ last: async () => undefined }).p, NOW)).toEqual({ none: "no-dictation" });
    expect(await learnFromWindow(ports({ last: async () => ({ id: "e1", text: SAID, at: NOW - RECENT_MS - 1 }) }).p, NOW)).toEqual({ none: "no-dictation" });
  });

  it("says there is nothing when the text was not changed", async () => {
    expect(await learnFromWindow(ports({ readValue: async () => ({ text: SAID }) }).p, NOW)).toEqual({ none: "nothing" });
    expect(await learnFromWindow(ports({ readValue: async () => undefined, selection: async () => "" }).p, NOW)).toEqual({ none: "nothing" });
  });
});

describe("terminals", () => {
  it("are told by program name, with or without .exe and in any case", () => {
    expect(isTerminal("WindowsTerminal.exe")).toBe(true);
    expect(isTerminal("PowerShell")).toBe(true);
    expect(isTerminal("com.googlecode.iterm2")).toBe(true);
    expect(isTerminal("notepad.exe")).toBe(false);
    expect(isTerminal("chrome.exe")).toBe(false);
    expect(TERMINALS.has("conhost")).toBe(true);
  });
});

function rig(start: Term[] = [], over: Partial<WindowPorts> = {}) {
  const shown: string[] = [];
  const state = { list: start };
  const learner = new CorrectionLearner({
    ports: ports(over).p,
    presenter: {
      toast: (text, tone) => void shown.push(`${tone ?? "ok"}: ${text}`),
      offer: (text, action) => void shown.push(`${text} [${action.label}:${action.id}]`),
    },
    terms: () => state.list,
    save: (list) => void (state.list = list),
    now: () => NOW,
  });
  return { learner, state, shown };
}

describe("the Learn correction key", () => {
  it("keeps a first sighting as a suggestion and offers a button that makes it a word that applies", async () => {
    const r = rig();
    await r.learner.press();
    expect(r.shown).toEqual(['Remember "cloud code" as "Claude Code"? [Remember:learn-save]']);
    expect(r.state.list).toMatchObject([{ word: "Claude Code", soundsLike: ["cloud code"], suggested: true, learned: { heard: "cloud code", count: 1, sources: ["e1"] } }]);
    expect(activeFixes(r.state.list, undefined)).toEqual([]);
    r.learner.save();
    expect(activeFixes(r.state.list, undefined)).toHaveLength(1);
    expect(r.state.list[0]?.suggested).toBeUndefined();
  });

  it("pressing it twice for the same dictation is one sighting, not an activation", async () => {
    const r = rig();
    await r.learner.press();
    await r.learner.press();
    expect(r.state.list).toMatchObject([{ learned: { count: 1 } }]);
    expect(r.state.list.some(isActive)).toBe(false);
    expect(r.shown[1]).toBe('Remember "cloud code" as "Claude Code"? [Remember:learn-save]');
  });

  it("starts a fix that was seen in another dictation, with a button that takes it back", async () => {
    const r = rig();
    await r.learner.press();
    const again = new CorrectionLearner({
      ports: ports({ last: async () => ({ id: "e2", text: SAID, at: NOW - 1000 }) }).p,
      presenter: { toast: () => undefined, offer: (text, action) => void r.shown.push(`${text} [${action.label}:${action.id}]`) },
      terms: () => r.state.list,
      save: (list) => void (r.state.list = list),
      now: () => NOW,
    });
    await again.press();
    expect(r.shown[1]).toBe('Learned "cloud code" as "Claude Code" [Undo:learn-undo]');
    expect(r.state.list).toMatchObject([{ learned: { count: 2, sources: ["e1", "e2"] } }]);
    expect(r.state.list.every(isActive)).toBe(true);
    again.undo();
    expect(r.state.list).toEqual([]);
  });

  it("the buttons do nothing for an offer that is not theirs", async () => {
    const r = rig();
    await r.learner.press();
    r.learner.undo();
    expect(r.state.list).toHaveLength(1);
    r.learner.save();
    r.learner.save();
    expect(r.state.list).toMatchObject([{ word: "Claude Code", learned: { count: 1 } }]);
    expect(r.state.list[0]?.suggested).toBeUndefined();
  });

  it("offers nothing to remember when the fix is already a saved word", async () => {
    const r = rig([{ id: "w", word: "Claude Code", soundsLike: ["cloud code"] }]);
    await r.learner.press();
    expect(r.state.list).toEqual([{ id: "w", word: "Claude Code", soundsLike: ["cloud code"] }]);
  });

  it("says why when there is nothing to learn", async () => {
    const r = rig([], { passwordFocused: () => true });
    await r.learner.press();
    expect(r.shown).toEqual(["error: Speak Kit cannot read this window"]);
    expect(r.state.list).toEqual([]);
    const t = rig([], { foreground: () => ({ elevated: false, exe: "cmd.exe" }), readValue: async () => undefined });
    await t.learner.press();
    expect(t.shown).toEqual(["error: Selection copy is not used in terminals"]);
  });

  it("a read that fails is told as a window it cannot read", async () => {
    const r = rig([], { last: async () => Promise.reject(new Error("history is gone")) });
    await r.learner.press();
    expect(r.shown).toEqual(["error: Speak Kit cannot read this window"]);
  });
});
