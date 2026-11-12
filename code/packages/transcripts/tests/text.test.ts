import { describe, expect, test } from "vitest";
import {
  checkFile,
  clock,
  cues,
  failures,
  findMatches,
  plainText,
  provisionalTitle,
  render,
  safeName,
  saveExport,
  removeIfUnchanged,
  sha256,
  SearchIndex,
  snippetAround,
  tokenize,
  freePath,
  knownExtension,
  sniff,
} from "../src";
import { MemFs } from "./fakes";

const fwd = (p: string) => p.replaceAll("\\", "/");

const doc = {
  title: "Budget call",
  createdAt: Date.UTC(2026, 10, 12, 14, 5),
  durationSec: 3723,
  language: "en",
  model: "m",
  source: "file" as const,
  sourceName: "call.m4a",
  segments: [
    { start: 0, end: 4.5, text: "Hello and welcome." },
    { start: 65, end: 70, text: "  We talk about the invoice.  " },
  ],
};

describe("clock", () => {
  test("formats minutes and hours", () => {
    expect([clock(0), clock(83), clock(3723), clock(-5), clock(59.9)]).toEqual(["0:00", "1:23", "1:02:03", "0:00", "0:59"]);
  });
});

describe("render", () => {
  test("txt", () => {
    expect(render("txt", doc)).toBe("Budget call\n2026-11-12 14:05\n\n[0:00] Hello and welcome.\n[1:05] We talk about the invoice.\n");
  });
  test("md", () => {
    expect(render("md", doc)).toBe(
      "# Budget call\n\n- Date: 2026-11-12 14:05\n- Length: 1:02:03\n- Language: en\n- Source: call.m4a\n\n**0:00** Hello and welcome.\n\n**1:05** We talk about the invoice.\n",
    );
    expect(render("md", { ...doc, source: "microphone" })).toContain("- Source: microphone");
    expect(render("md", { ...doc, sourceName: undefined as never })).toContain("- Source: audio file");
  });
  test("srt", () => {
    expect(render("srt", doc)).toBe("1\n00:00:00,000 --> 00:00:04,500\nHello and welcome.\n\n2\n00:01:05,000 --> 00:01:10,000\nWe talk about the invoice.\n");
  });
  test("vtt", () => {
    expect(render("vtt", { ...doc, segments: [{ start: 3661.25, end: 3662, text: "a --> b" }] })).toBe("WEBVTT\n\n01:01:01.250 --> 01:01:02.000\na -> b\n");
  });
  test("json", () => {
    const j = JSON.parse(render("json", doc));
    expect(j).toMatchObject({ title: "Budget call", durationSec: 3723, language: "en", model: "m", source: "file" });
    expect(j.segments).toHaveLength(2);
  });
  test("plain text is one paragraph per segment without empties", () => {
    expect(plainText([...doc.segments, { start: 9, end: 10, text: "   " }])).toBe("Hello and welcome.\n\nWe talk about the invoice.");
  });
});

describe("cues", () => {
  test("a short segment is one cue, at least half a second long", () => {
    expect(cues([{ start: 10, end: 10, text: "Hi" }])).toEqual([{ start: 10, end: 10.5, text: "Hi" }]);
  });
  test("an empty segment gives no cue", () => {
    expect(cues([{ start: 0, end: 5, text: "   " }])).toEqual([]);
  });
  test("a long segment is cut by sentence and the time is shared by length", () => {
    const text = "This is the first sentence of a long talk. Here is a second one that follows it closely! And a third?";
    const out = cues([{ start: 0, end: 30, text }]);
    expect(out.map((c) => c.text)).toEqual(["This is the first sentence of a long talk.", "Here is a second one that follows it closely!", "And a third?"]);
    expect(out[0]!.start).toBe(0);
    expect(out.at(-1)!.end).toBeCloseTo(30, 5);
    for (let i = 1; i < out.length; i++) expect(out[i]!.start).toBeCloseTo(out[i - 1]!.end, 5);
  });
  test("short sentences are joined into one cue", () => {
    const out = cues([{ start: 0, end: 20, text: "Yes. No. Maybe so. Well, we will see about that later on today at length." }]);
    expect(out[0]!.text).toBe("Yes. No. Maybe so.");
  });
  test("a cue pushed to half a second never overlaps the next", () => {
    const out = cues([
      { start: 0, end: 0.1, text: "a" },
      { start: 0.2, end: 3, text: "b" },
    ]);
    expect(out[0]!.end).toBe(0.2);
  });
});

describe("safeName", () => {
  test.each([
    ["Q3: plan/review?", "Q3 plan review"],
    ["  spaced   out  ", "spaced out"],
    ["trailing dots...", "trailing dots"],
    ["CON", "CON_"],
    ["nul.txt", "nul.txt_"],
    ["", "Transcript"],
    ["???", "Transcript"],
    [".hidden", "hidden"],
    ["a\u0001b", "a b"],
  ])("%s", (input, out) => expect(safeName(input)).toBe(out));
  test("is cut to 100 characters without splitting a character", () => {
    expect(Array.from(safeName("é".repeat(150)))).toHaveLength(100);
    expect(Array.from(safeName("😀".repeat(150)))).toHaveLength(100);
  });
  test("a fallback can be given", () => {
    expect(safeName("***", "Recording")).toBe("Recording");
  });
});

describe("exports on disk", () => {
  test("never overwrites: a taken name gets a number", async () => {
    const fs = new MemFs();
    fs.files.set("/out/a.md", new Uint8Array([1]));
    fs.files.set("/out/a (2).md", new Uint8Array([1]));
    expect(fwd(await freePath(fs, "/out", "a", "md"))).toBe("/out/a (3).md");
    const saved = await saveExport(fs, "/out", "a", "md", "text");
    expect({ ...saved, path: fwd(saved.path) }).toMatchObject({ path: "/out/a (3).md", kind: "new", sha256: sha256("text") });
    expect(fs.files.get("/out/a.md")).toEqual(new Uint8Array([1]));
  });

  test("a file from the last export that is unchanged is rewritten in place", async () => {
    const fs = new MemFs();
    const first = await saveExport(fs, "/out", "T", "txt", "v1");
    const second = await saveExport(fs, "/out", "T", "txt", "v2", first);
    expect({ ...second, path: fwd(second.path) }).toMatchObject({ path: "/out/T.txt", kind: "replaced", sha256: sha256("v2") });
    expect(fs.text("/out/T.txt")).toBe("v2");
  });

  test("a file the person changed is left alone and the export goes to a copy", async () => {
    const fs = new MemFs();
    const first = await saveExport(fs, "/out", "T", "txt", "v1");
    fs.files.set("/out/T.txt", new TextEncoder().encode("my edits"));
    const second = await saveExport(fs, "/out", "T", "txt", "v2", first);
    expect({ ...second, path: fwd(second.path) }).toMatchObject({ path: "/out/T (2).txt", kind: "copy" });
    expect(fs.text("/out/T.txt")).toBe("my edits");
    expect(fs.text("/out/T (2).txt")).toBe("v2");
  });

  test("a file that was moved away is written fresh under a free name", async () => {
    const fs = new MemFs();
    const first = await saveExport(fs, "/out", "T", "txt", "v1");
    fs.files.delete("/out/T.txt");
    const second = await saveExport(fs, "/out", "T", "txt", "v2", first);
    expect({ ...second, path: fwd(second.path) }).toMatchObject({ path: "/out/T.txt", kind: "new" });
  });

  test("removeIfUnchanged deletes an untouched file, keeps a changed one, accepts a missing one", async () => {
    const fs = new MemFs();
    const f = await saveExport(fs, "/out", "T", "txt", "v1");
    expect(await removeIfUnchanged(fs, f)).toBe(true);
    expect(fs.files.has("/out/T.txt")).toBe(false);
    expect(await removeIfUnchanged(fs, f)).toBe(true);
    fs.files.set("/out/T.txt", new TextEncoder().encode("changed"));
    expect(await removeIfUnchanged(fs, f)).toBe(false);
    expect(fs.text("/out/T.txt")).toBe("changed");
  });
});

describe("search", () => {
  test("tokenize lower-cases and splits on anything that is not a letter or digit", () => {
    expect(tokenize("Hello, WORLD! 3rd-floor Über")).toEqual(["hello", "world", "3rd", "floor", "über"]);
    expect(tokenize("")).toEqual([]);
  });

  const index = () => {
    const i = new SearchIndex();
    i.set("a", "The invoice is late. Please pay the invoice today.");
    i.set("b", "Lunch plans and weather");
    i.set("c", "Invoices for March, plus a long text about nothing at all that makes this one much longer than the others in the set");
    return i;
  };

  test("ranks the shorter, denser document first and needs every word", () => {
    const hits = index().search("invoice");
    expect(hits.map((h) => h.id)).toEqual(["a", "c"]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    expect(index().search("invoice weather")).toEqual([]);
    expect(
      index()
        .search("pay invoice")
        .map((h) => h.id),
    ).toEqual(["a"]);
  });

  test("the last word matches as a prefix, earlier words exactly", () => {
    expect(
      index()
        .search("inv")
        .map((h) => h.id),
    ).toEqual(["a", "c"]);
    expect(index().search("inv pay")).toEqual([]);
    expect(
      index()
        .search("pay inv")
        .map((h) => h.id),
    ).toEqual(["a"]);
  });

  test("empty query and empty index give nothing; limit and replace and remove work", () => {
    const i = index();
    expect(i.search("   ")).toEqual([]);
    expect(new SearchIndex().search("x")).toEqual([]);
    expect(i.search("invoice", 1)).toHaveLength(1);
    i.set("b", "Invoice at lunch");
    expect(i.search("invoice").map((h) => h.id)).toContain("b");
    i.remove("a");
    i.remove("zzz");
    expect(i.size).toBe(2);
    expect(i.search("late")).toEqual([]);
  });

  test("snippets are cut around the first match at word edges", () => {
    const text = `${"lorem ipsum dolor sit amet ".repeat(12)}the invoice number is here ${"consectetur adipiscing elit ".repeat(12)}`;
    const s = snippetAround(text, "invoice");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s).toContain("invoice");
    expect(s.length).toBeLessThanOrEqual(124);
    expect(snippetAround("short text", "text")).toBe("short text");
    expect(snippetAround("x".repeat(300), "zzz")).toHaveLength(121);
    expect(snippetAround("an invoice.", "invoice")).toBe("an invoice.");
  });

  test("find matches gives every place, ignoring case, with the time to jump to", () => {
    const segs = [
      { start: 0, end: 5, text: "Invoice one, invoice two" },
      { start: 10, end: 15, text: "nothing" },
      { start: 20, end: 25, text: "INVOICE" },
    ];
    expect(findMatches(segs, "invoice")).toEqual([
      { segment: 0, from: 0, to: 7, at: 0 },
      { segment: 0, from: 13, to: 20, at: 0 },
      { segment: 2, from: 0, to: 7, at: 20 },
    ]);
    expect(findMatches(segs, "  ")).toEqual([]);
    expect(findMatches(segs, "aa")).toEqual([]);
  });
});

describe("formats", () => {
  const head = (s: string) => new TextEncoder().encode(s.padEnd(16, "\0"));
  const f = (name: string, bytes: number, h: Uint8Array) => checkFile({ name, bytes, head: h });

  test("sniffs by content", () => {
    expect(sniff(head("RIFF\0\0\0\0WAVE"))).toBe("wav");
    expect(sniff(head("fLaC"))).toBe("flac");
    expect(sniff(head("OggS"))).toBe("ogg");
    expect(sniff(head("\0\0\0\x20ftypM4A "))).toBe("m4a");
    expect(sniff(head("ID3\x04"))).toBe("mp3");
    expect(sniff(new Uint8Array([0xff, 0xfb, 0x90, 0]))).toBe("mp3");
    expect(sniff(head("hello world, not audio"))).toBeUndefined();
    expect(sniff(new Uint8Array(0))).toBeUndefined();
  });

  test("a text file named .mp3 is unsupported and the message names the file and the formats", () => {
    const r = f("notes.mp3", 100, head("just text"));
    expect(r).toEqual({ ok: false, failure: failures.unsupported("notes.mp3") });
    expect(failures.unsupported("notes.mp3").message).toBe("notes.mp3 is not an audio file Speak Kit can read. These formats work: WAV, MP3, M4A, FLAC and OGG.");
  });

  test("a renamed audio file is accepted by its content", () => {
    expect(f("voice.dat", 100, head("fLaC"))).toEqual({ ok: true, format: "flac" });
  });

  test("empty, too large for its kind", () => {
    expect(f("a.wav", 0, head("RIFF\0\0\0\0WAVE"))).toMatchObject({ ok: false, failure: { code: "decode-failed" } });
    expect(f("a.mp3", 200 * 1024 ** 2 + 1, head("ID3"))).toMatchObject({ ok: false, failure: { code: "too-large" } });
    expect(f("a.mp3", 200 * 1024 ** 2, head("ID3"))).toEqual({ ok: true, format: "mp3" });
    expect(f("a.wav", 1024 ** 3 + 1, head("RIFF\0\0\0\0WAVE"))).toMatchObject({ ok: false, failure: { code: "too-large" } });
    expect(f("a.wav", 900 * 1024 ** 2, head("RIFF\0\0\0\0WAVE"))).toEqual({ ok: true, format: "wav" });
  });

  test("messages", () => {
    expect(failures.tooLong().message).toBe("This file is over the 4 hour limit. Split it into shorter parts and import each one.");
    expect(failures.engineMissing().code).toBe("engine-missing");
    expect(failures.engineLoading().code).toBe("engine-loading");
    expect(failures.diskFull().code).toBe("disk-full");
    expect(failures.failed().code).toBe("failed");
    expect(failures.tooLarge("x.wav").message).toContain("x.wav");
    expect(failures.decode("x.wav").message).toContain("x.wav");
  });

  test("known extensions", () => {
    expect(knownExtension("A.MP3")).toBe(true);
    expect(knownExtension("a.txt")).toBe(false);
    expect(knownExtension("noext")).toBe(false);
  });
});

describe("provisional title", () => {
  test("an import is named by its file", () => {
    expect(provisionalTitle({ source: "file", name: "weekly_sync_call.m4a", at: 0 })).toBe("weekly sync call");
    expect(provisionalTitle({ source: "file", name: "x".repeat(300) + ".wav", at: 0 })).toHaveLength(120);
  });
  test("a recording is named by its start time", () => {
    const at = new Date(2026, 10, 3, 9, 7).getTime();
    expect(provisionalTitle({ source: "microphone", at })).toBe("Conversation 3 Nov, 09:07");
    expect(provisionalTitle({ source: "file", name: ".wav", at })).toBe("Conversation 3 Nov, 09:07");
    expect(provisionalTitle({ source: "file", at })).toBe("Conversation 3 Nov, 09:07");
  });
});
