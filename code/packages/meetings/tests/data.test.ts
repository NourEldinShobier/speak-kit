import { describe, expect, it } from "vitest";
import {
  CopyCursor,
  DEFAULT_RETENTION,
  EventLog,
  MeetingSearch,
  MeetingStore,
  NOTES_FAILURES,
  applyVocabulary,
  audioLabel,
  highlightRanges,
  linesText,
  parseNotes,
  promptText,
  readEntry,
  readRetention,
  sweep,
  textDeadline,
  vocabularyVersion,
  writeNotes,
  type Line,
  type MeetingEntry,
  type NoteVersion,
} from "../src";
import { MemFs, clock } from "./fakes";

const HOUR = 3_600_000;
const entry = (o: Partial<MeetingEntry> = {}): MeetingEntry => ({
  id: "m1",
  title: "Standup",
  titleTemporary: false,
  providerId: "zoom",
  providerName: "Zoom",
  startedAt: 0,
  endedAt: 1000,
  durationSec: 1,
  status: "done",
  audio: { you: 100, them: 100 },
  notes: { state: "off", chapters: 0 },
  exports: [],
  ...o,
});
const line = (start: number, who: "You" | "Them", text: string): Line => ({ start, end: start + 2, who, text });

describe("manifest", () => {
  it("reads a row with nulls, wrong types and unknown fields, keeping the unknown ones", () => {
    const e = readEntry({ id: "a", title: null, status: "weird", startedAt: "x", audio: null, notes: { state: 5 }, exports: [1, "f.txt"], future: { k: 1 }, trashedAt: null });
    expect(e).toMatchObject({ id: "a", title: "Meeting", status: "failed", startedAt: 0, audio: { you: 0, them: 0 }, notes: { state: "off", chapters: 0 }, exports: ["f.txt"], future: { k: 1 } });
    expect(e && "trashedAt" in e).toBe(false);
    expect(readEntry(null)).toBeUndefined();
    expect(readEntry({ title: "no id" })).toBeUndefined();
  });

  it("round-trips through the file and keeps unknown fields", async () => {
    const fs = new MemFs();
    const c = clock();
    const s = await MeetingStore.open({ dir: "/d", fs, now: c.now });
    await s.mutate((m) => void m.set("m1", { ...entry(), future: 1 } as MeetingEntry));
    const again = await MeetingStore.open({ dir: "/d", fs, now: c.now });
    expect(again.get("m1")).toMatchObject({ title: "Standup", future: 1 });
    expect(JSON.parse(fs.text("/d/manifest.json")!).v).toBe(1);
  });

  it("keeps an unreadable manifest under a new name and starts empty", async () => {
    const fs = new MemFs();
    await fs.write("/d/manifest.json", "{ not json");
    const s = await MeetingStore.open({ dir: "/d", fs, now: () => 42 });
    expect(s.list()).toEqual([]);
    expect(s.notice).toEqual({ newer: false, recoveredFrom: "/d/manifest.invalid-42.json" });
    expect(fs.text("/d/manifest.invalid-42.json")).toBe("{ not json");
  });

  it("reads a newer manifest and refuses to change it", async () => {
    const fs = new MemFs();
    await fs.write("/d/manifest.json", JSON.stringify({ v: 9, entries: [entry()] }));
    const s = await MeetingStore.open({ dir: "/d", fs, now: () => 0 });
    expect(s.list()).toHaveLength(1);
    expect(s.notice.newer).toBe(true);
    await expect(s.mutate((m) => void m.clear())).rejects.toThrow("newer version");
    expect(JSON.parse(fs.text("/d/manifest.json")!).v).toBe(9);
  });

  it("leaves memory as it was when the write fails", async () => {
    const fs = new MemFs();
    const s = await MeetingStore.open({ dir: "/d", fs, now: () => 0 });
    fs.full = true;
    await expect(s.mutate((m) => void m.set("m1", entry()))).rejects.toThrow();
    expect(s.list()).toEqual([]);
  });

  it("runs changes one at a time, so a read-then-write never works on a stale copy", async () => {
    const fs = new MemFs();
    const s = await MeetingStore.open({ dir: "/d", fs, now: () => 0 });
    await s.mutate((m) => void m.set("m1", entry({ durationSec: 0 })));
    await Promise.all(
      Array.from({ length: 20 }, () =>
        s.mutate(async (m) => {
          const e = m.get("m1")!;
          await Promise.resolve();
          m.set("m1", { ...e, durationSec: e.durationSec + 1 });
        }),
      ),
    );
    expect(s.get("m1")!.durationSec).toBe(20);
  });

  it("keeps note versions and reads a damaged transcript as empty", async () => {
    const fs = new MemFs();
    const s = await MeetingStore.open({ dir: "/d", fs, now: () => 0 });
    const base = { at: 1, kind: "summary" as const, title: "T", summary: "S", chapters: [], writer: "w" };
    expect((await s.addNotes("m1", base)).n).toBe(1);
    expect((await s.addNotes("m1", { ...base, kind: "vocabulary" })).n).toBe(2);
    expect((await s.notes("m1")).map((v) => v.kind)).toEqual(["summary", "vocabulary"]);
    await fs.write("/d/m1/transcript.json", "oops");
    expect(await s.transcript("m1")).toEqual([]);
    await s.putTranscript("m1", [line(0, "You", "hi")]);
    expect(await s.transcript("m1")).toEqual([{ start: 0, end: 2, text: "hi", who: "You" }]);
  });
});

describe("retention", () => {
  it("defaults to 24 h of audio and 30 days of text", () => {
    expect(DEFAULT_RETENTION).toEqual({ audioHours: 24, textDays: 30, trashDays: 30 });
  });

  it("falls back to the default for a bad value and names it", () => {
    expect(readRetention({ audioHours: "soon", textDays: -3, trashDays: 0 })).toEqual({ value: DEFAULT_RETENTION, invalid: ["audioHours", "textDays", "trashDays"] });
    expect(readRetention(null)).toEqual({ value: DEFAULT_RETENTION, invalid: [] });
    expect(readRetention({ audioHours: 6, textDays: 0 })).toEqual({ value: { audioHours: 6, textDays: 0, trashDays: 30 }, invalid: [] });
    expect(readRetention({ audioHours: null }).invalid).toEqual([]);
  });

  it("shows the deadline on every row", () => {
    const r = DEFAULT_RETENTION;
    expect(audioLabel(entry({ endedAt: 0 }), 1 * HOUR, r)).toBe("Audio removed in 23 h");
    expect(audioLabel(entry({ endedAt: 0 }), 23 * HOUR + 1, r)).toBe("Audio removed in 1 h");
    expect(audioLabel(entry({ endedAt: 0 }), 23.5 * HOUR, r)).toBe("Audio removed in 30 min");
    expect(audioLabel(entry({ endedAt: 0 }), 24 * HOUR - 1000, r)).toBe("Audio removed in 1 min");
    expect(audioLabel(entry({ endedAt: 0 }), 24 * HOUR, r)).toBe("Audio removed");
    expect(audioLabel(entry({ audioRemovedAt: 5 }), 0, r)).toBe("Audio removed");
    expect(audioLabel(entry({ endedAt: 0 }), 0, { ...r, audioHours: 24 * 5 })).toBe("Audio removed in 5 days");
    expect(audioLabel(entry({ audio: { you: 0, them: 0 } }), 0, r)).toBeUndefined();
    expect(audioLabel(entry({ status: "recording" }), 0, r)).toBeUndefined();
  });

  it("sweeps audio, then text, then the Trash, leaving running meetings alone", () => {
    const r = DEFAULT_RETENTION;
    const day = 24 * HOUR;
    const all = [
      entry({ id: "old-audio", endedAt: 0 }),
      entry({ id: "fresh", endedAt: 40 * day - HOUR, startedAt: 40 * day - 2 * HOUR }),
      entry({ id: "old-text", startedAt: 0, endedAt: 0, audio: { you: 0, them: 0 }, audioRemovedAt: 1 }),
      entry({ id: "bin", trashedAt: 0, audio: { you: 0, them: 0 } }),
      entry({ id: "live", status: "recording", startedAt: 0 }),
      entry({ id: "failed", status: "failed", endedAt: 0 }),
    ];
    expect(sweep(all, 40 * day, r)).toEqual({ dropAudio: ["old-audio", "failed"], trash: ["old-audio", "old-text", "failed"], remove: ["bin"] });
  });

  it("keeps text forever with 0 days", () => {
    expect(textDeadline(entry(), { ...DEFAULT_RETENTION, textDays: 0 })).toBeUndefined();
    expect(textDeadline(entry({ trashedAt: 10 }), DEFAULT_RETENTION)).toBe(10 + 30 * 24 * HOUR);
  });
});

describe("notes", () => {
  const lines = [line(0, "You", "Let's plan the release."), line(65, "Them", "Wazuh needs the new Okta setup."), line(130, "You", "Agreed, ship Friday.")];
  const good = JSON.stringify({
    title: " Release plan ",
    summary: "They planned the release. They agreed to ship Friday.",
    chapters: [
      { start: 60, title: "Security" },
      { start: 0, title: "Plan" },
      { start: "x", title: "bad" },
      { start: 5, title: "" },
    ],
  });

  it("parses the answer, orders chapters and gives each its words", () => {
    expect(parseNotes(`\`\`\`json\n${good}\n\`\`\``, lines)).toEqual({
      title: "Release plan",
      summary: "They planned the release. They agreed to ship Friday.",
      chapters: [
        { start: 0, title: "Plan", text: "Let's plan the release." },
        { start: 60, title: "Security", text: "Wazuh needs the new Okta setup. Agreed, ship Friday." },
      ],
    });
  });

  it("drops a chapter that starts after the last word", () => {
    const answer = JSON.stringify({
      title: "T",
      summary: "S.",
      chapters: [
        { start: 0, title: "Plan" },
        { start: 9999, title: "Past the end" },
      ],
    });
    expect(parseNotes(answer, lines)?.chapters.map((c) => c.title)).toEqual(["Plan"]);
  });

  it("refuses an answer without a title or summary, or that is not JSON", () => {
    expect(parseNotes("sure!", lines)).toBeUndefined();
    expect(parseNotes(JSON.stringify({ title: "x" }), lines)).toBeUndefined();
  });

  it("writes the notes and names the writer", async () => {
    const r = await writeNotes({ writer: "GPT", complete: async () => ({ ok: true, text: good }) }, lines);
    expect(r).toMatchObject({ ok: true, writer: "GPT", notes: { title: "Release plan" } });
  });

  it.each(["no-key", "key-rejected", "no-credit", "rate-limited", "offline", "unavailable"] as const)("falls back to the transcript with a clear message on %s", async (code) => {
    const r = await writeNotes({ writer: "w", complete: async () => ({ ok: false, code }) }, lines);
    expect(r).toEqual({ ok: false, failure: { code, message: NOTES_FAILURES[code] } });
    expect(NOTES_FAILURES[code]).toContain(code === "offline" ? "unchanged" : "transcript and the audio are unchanged");
  });

  it("fails with a message when the writer answers nonsense, throws, or takes too long", async () => {
    expect(await writeNotes({ writer: "w", complete: async () => ({ ok: true, text: "nope" }) }, lines)).toMatchObject({ failure: { code: "unreadable" } });
    expect(
      await writeNotes(
        {
          writer: "w",
          complete: async () => {
            throw new Error("boom");
          },
        },
        lines,
      ),
    ).toMatchObject({ failure: { code: "unavailable" } });
    const slow = await writeNotes({ writer: "w", timeoutMs: 10, complete: (_s, _u, signal) => new Promise((_r, rej) => signal.addEventListener("abort", () => rej(new Error("aborted")))) }, lines);
    expect(slow).toMatchObject({ failure: { code: "timeout" } });
  });

  it("does not call the writer for a meeting with no words", async () => {
    let calls = 0;
    const r = await writeNotes({ writer: "w", complete: async () => (calls++, { ok: true, text: good }) }, [line(0, "You", "  ")]);
    expect(calls).toBe(0);
    expect(r).toMatchObject({ failure: { code: "empty" } });
  });

  it("cuts a huge transcript in the middle", () => {
    const big = Array.from({ length: 5000 }, (_, i) => line(i, "Them", "word ".repeat(10)));
    const t = promptText(big, 1000);
    expect(t.length).toBeLessThan(1100);
    expect(t).toContain("[... part of the meeting left out ...]");
    expect(promptText([line(3725, "You", "hi")])).toBe("[1:02:05] You: hi");
  });

  it("a transcript with one speaker is read without names and the writer is told nothing about You and Them", async () => {
    expect(promptText([{ start: 5, text: "hello" }])).toBe("[0:05] hello");
    const seen: string[] = [];
    const complete = async (system: string) => (seen.push(system), { ok: false as const, code: "offline" as const });
    await writeNotes({ writer: "w", complete }, [{ start: 0, text: "hello" }]);
    await writeNotes({ writer: "w", complete }, [line(0, "You", "hello")]);
    expect(seen[0]).not.toContain("Them");
    expect(seen[1]).toContain('"Them"');
  });

  it("applies vocabulary to whole words, longest first, without chains", () => {
    const v = [
      { from: "wazoo", to: "Wazuh" },
      { from: "okta setup", to: "Okta setup" },
      { from: "Wazuh", to: "wazuh!" },
    ];
    expect(applyVocabulary("The wazoo and the okta setup, wazoos stay.", v)).toEqual({ text: "The Wazuh and the Okta setup, wazoos stay.", changed: 2 });
    expect(applyVocabulary("nothing", v)).toEqual({ text: "nothing", changed: 0 });
    expect(applyVocabulary("x", [{ from: " ", to: "y" }])).toEqual({ text: "x", changed: 0 });
  });

  it("makes a vocabulary version of the notes only when something changed", () => {
    const base: NoteVersion = { n: 1, at: 1, kind: "summary", title: "Wazoo plan", summary: "About wazoo.", chapters: [{ start: 0, title: "Wazoo", text: "wazoo" }], writer: "GPT" };
    const r = vocabularyVersion(base, [{ from: "wazoo", to: "Wazuh" }], 9);
    expect(r).toEqual({
      changed: 4,
      version: { at: 9, kind: "vocabulary", title: "Wazuh plan", summary: "About Wazuh.", chapters: [{ start: 0, title: "Wazuh", text: "Wazuh" }], writer: "Vocabulary" },
    });
    expect(vocabularyVersion(base, [{ from: "zzz", to: "y" }], 9)).toBeUndefined();
    expect(base.title).toBe("Wazoo plan");
  });
});

describe("copy new", () => {
  it("returns only lines not copied before, even when a late line lands in the middle", () => {
    const c = new CopyCursor();
    const a = [line(0, "You", "one"), line(10, "Them", "three")];
    expect(c.take(a).map((l) => l.text)).toEqual(["one", "three"]);
    expect(c.take(a)).toEqual([]);
    const b = [...a, line(5, "You", "two")];
    expect(c.pending(b)).toBe(1);
    expect(c.take(b).map((l) => l.text)).toEqual(["two"]);
  });

  it("counts a corrected line as new, and reset starts over", () => {
    const c = new CopyCursor();
    c.take([line(0, "You", "teh")]);
    expect(c.take([line(0, "You", "the")])).toHaveLength(1);
    c.reset();
    expect(c.take([line(0, "You", "the")])).toHaveLength(1);
  });

  it("formats lines with or without the speaker and time", () => {
    const l = [line(65, "Them", "hello"), line(3, "You", "hi")];
    expect(linesText(l)).toBe("Them 1:05: hello\nYou 0:03: hi");
    expect(linesText(l, false)).toBe("hello\nhi");
  });
});

describe("search", () => {
  const make = () => {
    const s = new MeetingSearch();
    s.set("a", { title: "Weekly planning", summary: "Roadmap and hiring.", text: "we talked about the kubernetes migration" });
    s.set("b", { title: "Customer interview", text: "pricing feedback from the customer" });
    return s;
  };

  it("finds by title, summary and what was said, best first", () => {
    const s = make();
    expect(s.search("kubernetes").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("roadmap").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("custom").map((h) => h.id)).toEqual(["b"]);
    expect(s.search("  ")).toEqual([]);
  });

  it("finds a word typed one letter off, but not a short word", () => {
    const s = make();
    expect(s.search("kubernets").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("pricng").map((h) => h.id)).toEqual(["b"]);
    expect(s.search("zzzzzz")).toEqual([]);
  });

  it("answers the same question from memory until something changes", () => {
    const s = make();
    const first = s.search("kubernetes");
    expect(s.search("kubernetes")).toBe(first);
    s.remove("a");
    expect(s.search("kubernetes")).toEqual([]);
    expect(s.version).toBeGreaterThan(0);
  });

  it("finds both spellings of a vocabulary word", () => {
    const s = new MeetingSearch();
    s.setVocabulary([{ from: "wazoo", to: "Wazuh" }]);
    s.set("a", { title: "Security", text: "the wazoo agent" });
    expect(s.search("wazuh").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("wazoo").map((h) => h.id)).toEqual(["a"]);
  });

  it("highlights every query word, extended over the rest of the word", () => {
    expect(highlightRanges("The Kubernetes migration, kube", "kube migr")).toEqual([
      { from: 4, to: 14 },
      { from: 15, to: 24 },
      { from: 26, to: 30 },
    ]);
    expect(highlightRanges("abc", "")).toEqual([]);
  });
});

describe("finished events", () => {
  const open = (fs = new MemFs(), cap?: number) => EventLog.open({ fs, file: "/e.json", now: () => 5000, ...(cap && { cap }) });
  const ev = (n: number) => ({ meetingId: `m${n}`, title: `T${n}`, durationSec: n });

  it("numbers events and lets a consumer catch up after a gap", async () => {
    const log = await open();
    const base = log.latest;
    await log.emit(ev(1));
    await log.emit(ev(2));
    await log.emit(ev(3));
    expect(log.since(base + 1)).toMatchObject({ events: [{ seq: base + 2, meetingId: "m2" }, { seq: base + 3 }], latest: base + 3, gap: false });
    expect(log.since(base + 3).events).toEqual([]);
  });

  it("survives a restart without repeating a number", async () => {
    const fs = new MemFs();
    const a = await open(fs);
    const e = await a.emit(ev(1));
    const b = await open(fs);
    expect((await b.emit(ev(2))).seq).toBe(e.seq + 1);
    expect(b.since(0).events).toHaveLength(2);
  });

  it("drops the oldest past the cap and says a consumer behind it missed events", async () => {
    const log = await open(new MemFs(), 2);
    const base = log.latest;
    for (let i = 1; i <= 4; i++) await log.emit(ev(i));
    expect(log.since(base).gap).toBe(true);
    expect(log.since(base + 2).gap).toBe(false);
    expect(log.since(base + 2).events.map((e) => e.meetingId)).toEqual(["m3", "m4"]);
  });

  it("tracks what each consumer has, never moving backwards", async () => {
    const log = await open();
    const e1 = await log.emit(ev(1));
    const e2 = await log.emit(ev(2));
    await log.ack("cli", e1.seq);
    await log.ack("cli", 0);
    expect(log.status("cli").map((s) => s.delivered)).toEqual([true, false]);
    await log.ack("cli", e2.seq + 100);
    expect(log.status("cli").map((s) => s.delivered)).toEqual([true, true]);
    expect(log.status("other").map((s) => s.delivered)).toEqual([false, false]);
  });

  it("starts fresh from the clock when the file is damaged, so numbers stay above what a consumer saw", async () => {
    const fs = new MemFs();
    await fs.write("/e.json", "garbage");
    const log = await open(fs);
    expect(log.latest).toBe(5);
    expect(log.since(0)).toMatchObject({ events: [], gap: true });
  });
});
