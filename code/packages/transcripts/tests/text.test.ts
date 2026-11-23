import { describe, expect, test } from "vitest";
import { checkFile, clock, failures, findMatches, plainText, provisionalTitle, SearchIndex, snippetAround, tokenize, knownExtension, sniff } from "../src";

describe("clock", () => {
  test("formats minutes and hours", () => {
    expect([clock(0), clock(83), clock(3723), clock(-5), clock(59.9)]).toEqual(["0:00", "1:23", "1:02:03", "0:00", "0:59"]);
  });
});

describe("plain text", () => {
  test("is one paragraph per segment without empties", () => {
    const segments = [
      { start: 0, end: 4.5, text: "Hello and welcome." },
      { start: 65, end: 70, text: "  We talk about the invoice.  " },
      { start: 9, end: 10, text: "   " },
    ];
    expect(plainText(segments)).toBe("Hello and welcome.\n\nWe talk about the invoice.");
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
    expect(provisionalTitle({ name: "weekly_sync_call.m4a", at: 0 })).toBe("weekly sync call");
    expect(provisionalTitle({ name: "x".repeat(300) + ".wav", at: 0 })).toHaveLength(120);
  });
  test("a name with nothing left of it is replaced by the time of the import", () => {
    const at = new Date(2026, 10, 3, 9, 7).getTime();
    expect(provisionalTitle({ name: ".wav", at })).toBe("Transcript 3 Nov, 09:07");
    expect(provisionalTitle({ at })).toBe("Transcript 3 Nov, 09:07");
  });
});
