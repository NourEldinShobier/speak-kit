import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { Line, MeetingEntry, NoteVersion } from "@speakkit/meetings";
import { diskSources, parseOffset, runRead, type Sources } from "./index";
import { clock, overlapping } from "./time";
import type { CaptureRecord } from "./captures";

const entry = (id: string, over: Partial<MeetingEntry> = {}): MeetingEntry => ({
  id,
  title: `Meeting ${id}`,
  titleTemporary: false,
  providerId: "zoom",
  providerName: "Zoom",
  startedAt: Date.UTC(2026, 10, 12, 10, 0),
  durationSec: 600,
  status: "done",
  audio: { you: 0, them: 0 },
  notes: { state: "done", chapters: 2 },
  exports: [],
  ...over,
});

const lines: Line[] = [
  { start: 0, end: 20, text: "Welcome everyone to the budget review", who: "You" },
  { start: 20, end: 70, text: "The marketing spend is over plan", who: "Them" },
  { start: 70, end: 130, text: "We should move the launch to March", who: "You" },
];
const notes: NoteVersion[] = [
  {
    n: 1,
    at: 1,
    kind: "summary",
    title: "Budget",
    summary: "Spend is over plan; launch moves.",
    writer: "m",
    chapters: [
      { start: 0, title: "Welcome", text: "" },
      { start: 60, title: "Launch", text: "" },
    ],
  },
];

function memory(entries: MeetingEntry[], records: CaptureRecord[] = []): Sources {
  return {
    meetings: async () => ({ entries, transcript: async () => lines, notes: async (id) => (id === "aaaaaa1" ? notes : []) }),
    captures: async () => ({ records, root: "C:\\caps" }),
  };
}
const two = [
  entry("aaaaaa1"),
  entry("aaaaaa2", { startedAt: Date.UTC(2026, 10, 13, 9, 0), title: "Standup" }),
  entry("kkkkkk9", { startedAt: 2 }),
  entry("bbbbbb3", { startedAt: 1, trashedAt: 5, title: "Gone" }),
];

describe("time offsets", () => {
  it.each([
    ["90", 90],
    ["1:30", 90],
    ["1:02:03", 3723],
    ["0:05.5", 5.5],
  ])("reads %s as %d seconds", (text, seconds) => expect(parseOffset(text)).toBe(seconds));
  it.each(["", "-5", "1:75", "1:2:3", "abc", "1:60", "1::30"])("refuses %j", (text) => expect(parseOffset(text)).toBeUndefined());
  it("formats clocks and keeps lines that overlap a range", () => {
    expect(clock(83)).toBe("01:23");
    expect(clock(3723)).toBe("1:02:03");
    expect(overlapping(lines, 20, 70).map((l) => l.start)).toEqual([20]);
    expect(overlapping(lines, 19, 21).map((l) => l.start)).toEqual([0, 20]);
    expect(overlapping(lines, 130).length).toBe(0);
  });
});

describe("meetings list", () => {
  it("lists newest first, hides trashed ones and honours the limit", async () => {
    const r = await runRead({ command: "meetings", action: "list" }, memory(two));
    expect(r.ok && (r.data as { meetings: { id: string }[] }).meetings.map((m) => m.id)).toEqual(["aaaaaa2", "aaaaaa1", "kkkkkk9"]);
    const one = await runRead({ command: "meetings", action: "list", limit: 1 }, memory(two));
    expect(one.ok && (one.data as { meetings: unknown[] }).meetings.length).toBe(1);
  });
  it("says so when there are none", async () => {
    const r = await runRead({ command: "meetings", action: "list" }, memory([]));
    expect(r).toMatchObject({ ok: true, text: "No meetings yet." });
  });
});

describe("meetings show", () => {
  it("accepts an id, a 6-character prefix and latest", async () => {
    for (const ref of ["aaaaaa1", "kkkkkk9", "kkkkkk", "latest"]) expect((await runRead({ command: "meetings", action: "show", ref }, memory(two))).ok).toBe(true);
    const latest = await runRead({ command: "meetings", action: "show", ref: "latest" }, memory(two));
    expect(latest.ok && (latest.data as { meeting: { id: string } }).meeting.id).toBe("aaaaaa2");
  });
  it("refuses a short, unknown or ambiguous reference with a sentence", async () => {
    expect(await runRead({ command: "meetings", action: "show", ref: "aaa" }, memory(two))).toMatchObject({ ok: false, message: expect.stringContaining("too short") });
    expect(await runRead({ command: "meetings", action: "show", ref: "zzzzzz" }, memory(two))).toMatchObject({ ok: false, message: 'No meeting has the id "zzzzzz".' });
    expect(await runRead({ command: "meetings", action: "show", ref: "aaaaaa" }, memory(two))).toMatchObject({ ok: false, message: '"aaaaaa" matches 2 meetings. Use more of the id.' });
    expect(await runRead({ command: "meetings", action: "show" }, memory(two))).toMatchObject({ ok: false, code: "usage" });
    expect(await runRead({ command: "meetings", action: "show", ref: "latest" }, memory([]))).toMatchObject({ ok: false, message: "There are no meetings yet." });
  });
  it("prints Markdown with the summary, the chapters and the clock of every line", async () => {
    const r = await runRead({ command: "meetings", action: "show", ref: "aaaaaa1" }, memory(two));
    expect(r.ok && r.text).toBe(
      [
        "# Meeting aaaaaa1",
        "",
        "2026-11-12 10:00 · 10:00 · Zoom · done · aaaaaa1",
        "",
        "## Summary",
        "",
        "Spend is over plan; launch moves.",
        "",
        "## Chapters",
        "",
        "1. 00:00 Welcome",
        "2. 01:00 Launch",
        "",
        "## Transcript",
        "",
        "[00:00] You: Welcome everyone to the budget review",
        "[00:20] Them: The marketing spend is over plan",
        "[01:10] You: We should move the launch to March",
      ].join("\n"),
    );
  });
  it("cuts to a time range and to a chapter", async () => {
    const range = await runRead({ command: "meetings", action: "show", ref: "aaaaaa1", from: 65, to: 100 }, memory(two));
    expect(range.ok && (range.data as { meeting: { lines: { text: string }[]; range: unknown } }).meeting).toMatchObject({
      range: { from: 65, to: 100 },
      lines: [{ text: "The marketing spend is over plan" }, { text: "We should move the launch to March" }],
    });
    const chapter = await runRead({ command: "meetings", action: "show", ref: "aaaaaa1", chapter: 2 }, memory(two));
    expect(chapter.ok && (chapter.data as { meeting: { lines: unknown[] } }).meeting.lines.length).toBe(2);
    expect(chapter.ok && chapter.text).toContain("## Transcript (01:00 to end)");
    const first = await runRead({ command: "meetings", action: "show", ref: "aaaaaa1", chapter: 1 }, memory(two));
    expect(first.ok && (first.data as { meeting: { lines: unknown[] } }).meeting.lines.length).toBe(2);
  });
  it("refuses an empty or backwards range and a chapter that does not exist", async () => {
    expect(await runRead({ command: "meetings", action: "show", ref: "aaaaaa1", from: 50, to: 50 }, memory(two))).toMatchObject({ ok: false, message: "--to must be later than --from." });
    expect(await runRead({ command: "meetings", action: "show", ref: "aaaaaa1", chapter: 3 }, memory(two))).toMatchObject({
      ok: false,
      message: "This meeting has 2 chapters; there is no chapter 3.",
    });
    expect(await runRead({ command: "meetings", action: "show", ref: "aaaaaa2", chapter: 1 }, memory(two))).toMatchObject({ ok: false, message: "This meeting has no chapters." });
  });
  it("says so when nothing was said in the range", async () => {
    const r = await runRead({ command: "meetings", action: "show", ref: "aaaaaa1", from: 500 }, memory(two));
    expect(r.ok && r.text).toContain("Nothing was said in this range.");
  });
  it("lists chapters alone", async () => {
    const r = await runRead({ command: "meetings", action: "chapters", ref: "aaaaaa1" }, memory(two));
    expect(r).toMatchObject({
      ok: true,
      text: "1. 00:00 Welcome\n2. 01:00 Launch",
      data: {
        id: "aaaaaa1",
        chapters: [
          { n: 1, start: 0, title: "Welcome" },
          { n: 2, start: 60, title: "Launch" },
        ],
      },
    });
  });
});

describe("meetings search", () => {
  it("finds a word in the transcript, with the meeting and a snippet", async () => {
    const r = await runRead({ command: "meetings", action: "search", query: "marketing" }, memory(two));
    expect(r.ok && (r.data as { hits: { id: string; snippet: string }[] }).hits.map((h) => h.id).sort()).toEqual(["aaaaaa1", "aaaaaa2", "kkkkkk9"]);
  });
  it("needs words and never returns a trashed meeting", async () => {
    expect(await runRead({ command: "meetings", action: "search", query: "  " }, memory(two))).toMatchObject({ ok: false, code: "usage" });
    const r = await runRead({ command: "meetings", action: "search", query: "marketing", limit: 1 }, memory(two));
    expect(r.ok && (r.data as { hits: unknown[] }).hits.length).toBe(1);
    expect(await runRead({ command: "meetings", action: "search", query: "zebra" }, memory(two))).toMatchObject({ ok: true, text: "Nothing found." });
  });
  it("refuses an unknown action", async () => {
    expect(await runRead({ command: "meetings", action: "wipe" }, memory(two))).toMatchObject({ ok: false, code: "usage" });
  });
});

const rec = (id: string, over: Partial<CaptureRecord> = {}): CaptureRecord => ({ id, kind: "recording", title: `Capture ${id}`, at: 1000, dir: `d-${id}`, bytes: 10, chips: ["saved"], ...over });

describe("capture list and show", () => {
  const records = [
    rec("c1", {
      at: 1000,
      durationMs: 4000,
      words: [
        { text: "this", startMs: 500, endMs: 800 },
        { text: "button", startMs: 900, endMs: 1200 },
        { text: "is", startMs: 2500, endMs: 2700 },
      ],
    }),
    rec("c2", { at: 3000, kind: "screenshot", title: "Login page" }),
    rec("c3", { at: 2000, finishing: true }),
  ];
  it("lists newest first without captures still being finished", async () => {
    const r = await runRead({ command: "capture", action: "list" }, memory([], records));
    expect(r.ok && (r.data as { captures: { id: string }[] }).captures.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(await runRead({ command: "capture", action: "list" }, memory([], []))).toMatchObject({ ok: true, text: "No captures yet." });
  });
  it("shows one by id, folder, title or latest, with its narration grouped by second", async () => {
    const byId = await runRead({ command: "capture", action: "show", ref: "c1" }, memory([], records));
    expect(byId.ok && byId.text).toBe(["Capture c1", "1970-01-01 00:00 · recording · c1", "Folder: C:/caps/d-c1", "", "[00:00] this button", "[00:02] is"].join("\n"));
    for (const ref of ["d-c1", "capture c1", "latest"]) expect((await runRead({ command: "capture", action: "show", ref }, memory([], records))).ok).toBe(true);
    expect(await runRead({ command: "capture", action: "show", ref: "nope" }, memory([], records))).toMatchObject({ ok: false, message: 'No capture is called "nope".' });
    expect(await runRead({ command: "capture", action: "show" }, memory([], records))).toMatchObject({ ok: false, code: "usage" });
    expect(await runRead({ command: "capture", action: "show", ref: "latest" }, memory([], []))).toMatchObject({ ok: false, message: "There are no captures yet." });
  });
  it("refuses a title two captures share", async () => {
    const same = [rec("x1", { title: "Same" }), rec("x2", { title: "Same" })];
    expect(await runRead({ command: "capture", action: "show", ref: "same" }, memory([], same))).toMatchObject({ ok: false, message: '"same" names 2 captures. Use the id.' });
  });
});

describe("reads from the data folder change nothing", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  const snapshot = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (p: string) => {
      for (const n of readdirSync(p)) {
        const f = path.join(p, n);
        if (statSync(f).isDirectory()) walk(f);
        else out.push(`${f}|${statSync(f).mtimeMs}|${readFileSync(f).toString("hex")}`);
      }
    };
    walk(dir);
    return out.sort();
  };

  it("lists, shows and searches real files and leaves every byte, time and name as it was, damaged files included", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "sk-reads-"));
    dirs.push(dir);
    mkdirSync(path.join(dir, "meetings", "aaaaaa1"), { recursive: true });
    writeFileSync(path.join(dir, "meetings", "manifest.json"), JSON.stringify({ v: 1, entries: [entry("aaaaaa1")] }));
    writeFileSync(path.join(dir, "meetings", "aaaaaa1", "transcript.json"), JSON.stringify({ v: 1, lines }));
    mkdirSync(path.join(dir, "captures"), { recursive: true });
    writeFileSync(path.join(dir, "captures", "index.json"), "{ not json");
    const before = snapshot(dir);
    const src = diskSources(dir);
    const shown = await runRead({ command: "meetings", action: "show", ref: "latest", from: 20 }, src);
    expect(shown.ok && (shown.data as { meeting: { lines: unknown[] } }).meeting.lines.length).toBe(2);
    expect((await runRead({ command: "meetings", action: "search", query: "launch" }, src)).ok).toBe(true);
    expect(await runRead({ command: "capture", action: "list" }, src)).toMatchObject({ ok: true, text: "No captures yet." });
    expect(snapshot(dir)).toEqual(before);
  });

  it("reads an empty data folder as no meetings and no captures, and creates nothing", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "sk-reads-"));
    dirs.push(dir);
    const src = diskSources(dir);
    expect(await runRead({ command: "meetings", action: "list" }, src)).toMatchObject({ ok: true, text: "No meetings yet." });
    expect(await runRead({ command: "capture", action: "list" }, src)).toMatchObject({ ok: true, text: "No captures yet." });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("uses the capture folder named in the settings file", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "sk-reads-"));
    dirs.push(dir);
    const other = path.join(dir, "elsewhere");
    mkdirSync(other);
    writeFileSync(path.join(other, "index.json"), JSON.stringify([rec("z1", { title: "Elsewhere" })]));
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ capture: { folder: other } }));
    const r = await runRead({ command: "capture", action: "list" }, diskSources(dir));
    expect(r.ok && (r.data as { captures: { title: string }[] }).captures[0]?.title).toBe("Elsewhere");
  });
});
