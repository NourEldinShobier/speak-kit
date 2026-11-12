import { describe, expect, test } from "vitest";
import { checkFile, decodeWav, encodeWav16k, failures, knownExtension, provisionalTitle, SearchIndex, snippetAround, sniff, wavInfo } from "../src";

describe("BM25 scores", () => {
  const docs = () => {
    const i = new SearchIndex();
    i.set("a", "invoice invoice late");
    i.set("b", "lunch weather plans today");
    i.set("c", "invoice march");
    return i;
  };

  test("scores follow the BM25 formula (k1 1.2, b 0.75)", () => {
    const hits = docs().search("invoice");
    expect(hits.map((h) => h.id)).toEqual(["a", "c"]);
    expect(hits[0]!.score).toBeCloseTo(0.64625499, 6);
    expect(hits[1]!.score).toBeCloseTo(0.54421473, 6);
    expect(docs().search("inv")[0]!.score).toBeCloseTo(0.64625499, 6);
    expect(docs().search("late invoice")[0]!.score).toBeCloseTo(1.62708424, 6);
  });

  test("setting a document again, or removing others, does not leave its length counted twice", () => {
    const i = new SearchIndex();
    i.set("a", "invoice invoice late");
    i.set("a", "invoice invoice late");
    i.set("b", "lunch weather plans today");
    i.set("c", "invoice march");
    expect(i.search("invoice")[0]!.score).toBeCloseTo(0.64625499, 6);
    i.remove("b");
    i.remove("c");
    i.remove("c");
    expect(i.search("invoice")[0]!.score).toBeCloseTo(0.39556284, 6);
  });

  test("documents with the same score come newest id first", () => {
    const i = new SearchIndex();
    for (const id of ["a", "c", "b"]) i.set(id, "same words");
    expect(i.search("same").map((h) => h.id)).toEqual(["c", "b", "a"]);
  });

  test("a result carries the words around the match", () => {
    const i = new SearchIndex();
    i.set("a", `${"filler ".repeat(40)}invoice ${"more ".repeat(40)}`);
    const [hit] = i.search("invoice");
    expect(hit!.snippet.startsWith("…")).toBe(true);
    expect(hit!.snippet).toContain("invoice");
  });
});

describe("snippetAround", () => {
  test("a match in the middle sits a third of the way in, with ellipses on both sides", () => {
    const text = `${"a ".repeat(100)}needle ${"b ".repeat(100)}`;
    expect(snippetAround(text, "needle")).toBe(`…${"a ".repeat(20)}needle ${"b ".repeat(36)}b…`);
  });

  test("a match at the start has no leading ellipsis", () => {
    expect(snippetAround(`needle ${"b ".repeat(100)}`, "needle")).toBe(`needle ${"b ".repeat(56)}b…`);
  });

  test("a match at the end has no trailing ellipsis", () => {
    expect(snippetAround(`${"a ".repeat(100)}needle`, "needle")).toBe(`…${"a ".repeat(57)}needle`);
  });

  test("a term that is not found shows the start; short text is returned whole, with white space folded", () => {
    expect(snippetAround("x".repeat(300), "zzz")).toBe(`${"x".repeat(120)}…`);
    expect(snippetAround("  one\n\ttwo   three ", "two")).toBe("one two three");
    expect(snippetAround("a".repeat(120), "a")).toBe("a".repeat(120));
    expect(snippetAround("a".repeat(121), "a")).toBe(`${"a".repeat(120)}…`);
  });

  test("the term is matched at the start of a word, and special characters are taken literally", () => {
    // "at" is inside "cat", not at the start of a word: nothing is found and the start is shown.
    expect(snippetAround(`${"x ".repeat(80)}cat ${"y ".repeat(30)}`, "at")).toBe(`${"x ".repeat(59)}x…`);
    expect(snippetAround(`${"x ".repeat(80)}cat ${"y ".repeat(30)}`, "ca")).toContain("cat");
    expect(snippetAround(`${"q ".repeat(80)}a.b ${"z ".repeat(30)}`, "a.b")).toContain("a.b");
    expect(snippetAround(`${"q ".repeat(80)}axb ${"z ".repeat(30)}`, "a.b")).not.toContain("axb");
  });
});

describe("provisional title", () => {
  test("all twelve months and two-digit times", () => {
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    names.forEach((m, i) => expect(provisionalTitle({ source: "microphone", at: new Date(2026, i, 7, 3, 4).getTime() })).toBe(`Conversation 7 ${m}, 03:04`));
    expect(provisionalTitle({ source: "microphone", at: new Date(2026, 0, 31, 23, 59).getTime() })).toBe("Conversation 31 Jan, 23:59");
  });

  test("file names lose their extension and underscores, and keep dots that are not an extension", () => {
    expect(provisionalTitle({ source: "file", name: "Weekly__sync_call.m4a", at: 0 })).toBe("Weekly sync call");
    expect(provisionalTitle({ source: "file", name: "archive.tar.gz", at: 0 })).toBe("archive.tar");
    expect(provisionalTitle({ source: "file", name: "noext", at: 0 })).toBe("noext");
    expect(provisionalTitle({ source: "file", name: "  spaced  .wav", at: 0 })).toBe("spaced");
    expect(provisionalTitle({ source: "file", name: "a.verylongext", at: 0 })).toBe("a.verylongext");
  });

  test("a microphone recording ignores a name", () => {
    expect(provisionalTitle({ source: "microphone", name: "x.wav", at: new Date(2026, 5, 1, 12, 0).getTime() })).toBe("Conversation 1 Jun, 12:00");
  });
});

describe("file checks", () => {
  const head = (s: string) => new TextEncoder().encode(s.padEnd(16, "\0"));

  test("every message says what it says", () => {
    expect(failures.tooLarge("a.wav")).toEqual({ code: "too-large", message: "a.wav is too large to import. Split it into shorter parts and import each one." });
    expect(failures.decode("a.wav")).toEqual({ code: "decode-failed", message: "a.wav could not be decoded. The file may be damaged or protected; try exporting it again as WAV or MP3." });
    expect(failures.engineMissing()).toEqual({ code: "engine-missing", message: "No speech model is installed. Download one in Dictation, then try again." });
    expect(failures.engineLoading()).toEqual({ code: "engine-loading", message: "The speech model is still loading. Try again in a moment." });
    expect(failures.diskFull()).toEqual({ code: "disk-full", message: "The disk is full, so the transcript could not be saved. Free some space and try again." });
    expect(failures.failed()).toEqual({ code: "failed", message: "Transcription stopped because the speech engine failed. Try again." });
    expect(failures.nothingRecorded()).toEqual({ code: "decode-failed", message: "Nothing was recorded, so there is nothing to transcribe." });
  });

  test("known extensions", () => {
    for (const e of ["wav", "wave", "mp3", "m4a", "mp4", "aac", "flac", "ogg", "oga", "opus", "WAV"]) expect(knownExtension(`a.${e}`)).toBe(true);
    for (const e of ["txt", "pdf", "mp5", ""]) expect(knownExtension(`a.${e}`)).toBe(false);
  });

  test("the first bytes decide the format", () => {
    expect(sniff(head("RIFF\0\0\0\0WAVE"))).toBe("wav");
    expect(sniff(head("RIFF\0\0\0\0AVI "))).toBeUndefined();
    expect(sniff(head("RIFX\0\0\0\0WAVE"))).toBeUndefined();
    expect(sniff(head("fLaC"))).toBe("flac");
    expect(sniff(head("fLaX"))).toBeUndefined();
    expect(sniff(head("OggS"))).toBe("ogg");
    expect(sniff(head("\0\0\0\0ftypisom"))).toBe("m4a");
    expect(sniff(head("\0\0\0\0ftxpisom"))).toBeUndefined();
    expect(sniff(head("ID3"))).toBe("mp3");
    expect(sniff(head("ID4"))).toBeUndefined();
    expect(sniff(Uint8Array.from([0xff, 0xe0]))).toBe("mp3");
    expect(sniff(Uint8Array.from([0xff, 0xfb]))).toBe("mp3");
    expect(sniff(Uint8Array.from([0xff, 0xc0]))).toBeUndefined();
    expect(sniff(Uint8Array.from([0xfe, 0xe0]))).toBeUndefined();
    expect(sniff(Uint8Array.from([0xff]))).toBeUndefined();
    expect(sniff(Uint8Array.from([0x49, 0x44]))).toBeUndefined();
    expect(sniff(Uint8Array.from([0x49, 0x44, 0x33]))).toBe("mp3");
    expect(sniff(head("fLa"))).toBeUndefined();
    expect(sniff(new TextEncoder().encode("RIFF\0\0\0\0WAV"))).toBeUndefined();
    expect(sniff(new TextEncoder().encode("\0\0\0\0ftyp"))).toBe("m4a");
    expect(sniff(new TextEncoder().encode("\0\0\0\0fty"))).toBeUndefined();
  });

  test("size limits are inclusive: a WAVE up to 1 GiB, other formats up to 400 MiB", () => {
    const wav = head("RIFF\0\0\0\0WAVE");
    expect(checkFile({ name: "a.wav", bytes: 1024 ** 3, head: wav })).toEqual({ ok: true, format: "wav" });
    expect(checkFile({ name: "a.wav", bytes: 1024 ** 3 + 1, head: wav })).toEqual({ ok: false, failure: failures.tooLarge("a.wav") });
    expect(checkFile({ name: "a.flac", bytes: 400 * 1024 ** 2, head: head("fLaC") })).toEqual({ ok: true, format: "flac" });
    expect(checkFile({ name: "a.flac", bytes: 400 * 1024 ** 2 + 1, head: head("fLaC") })).toEqual({ ok: false, failure: failures.tooLarge("a.flac") });
    expect(checkFile({ name: "a.wav", bytes: 1, head: wav })).toEqual({ ok: true, format: "wav" });
  });
});

describe("WAVE files", () => {
  test("the kept audio has exactly the 16 kHz mono 16-bit header", () => {
    const wav = encodeWav16k(Int16Array.from([1, -1]));
    const hex = Buffer.from(wav).toString("hex");
    expect(hex).toBe(["52494646", "28000000", "57415645", "666d7420", "10000000", "0100", "0100", "803e0000", "007d0000", "0200", "1000", "64617461", "04000000", "0100", "ffff"].join(""));
  });

  test("an extensible format header reports the real format", () => {
    const b = new Uint8Array(12 + 8 + 40 + 8);
    const dv = new DataView(b.buffer);
    const tag = (at: number, s: string) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)));
    tag(0, "RIFF");
    tag(8, "WAVE");
    tag(12, "fmt ");
    dv.setUint32(16, 40, true);
    dv.setUint16(20, 0xfffe, true);
    dv.setUint16(22, 2, true);
    dv.setUint32(24, 44100, true);
    dv.setUint16(34, 24, true);
    dv.setUint16(44, 3, true); // sub-format: float
    tag(60, "data");
    dv.setUint32(64, 0, true);
    expect(wavInfo(b)).toMatchObject({ format: 3, channels: 2, rate: 44100, bits: 24, dataStart: 68, dataEnd: 68 });
  });

  test("a native 16 kHz file ignores a stray last byte and a size field that runs past the end, and the result is a copy", () => {
    const wav = encodeWav16k(Int16Array.from([5, 6, 7]));
    const odd = Uint8Array.from([...wav, 9]);
    new DataView(odd.buffer).setUint32(40, 0xfffffff0, true);
    const out = decodeWav(odd);
    expect([...out]).toEqual([5, 6, 7, 9 | 0].slice(0, 3));
    out[0] = 99;
    expect(odd[44]).toBe(5);
  });

  test("44.1 kHz audio comes out at 16 kHz with its level kept, edges included", () => {
    const n = 44_100;
    const data = new Uint8Array(new Int16Array(n).fill(1000).buffer);
    const b = new Uint8Array(44 + data.length);
    b.set(encodeWav16k(new Int16Array(0)).subarray(0, 44));
    const dv = new DataView(b.buffer);
    dv.setUint32(24, 44100, true);
    dv.setUint32(40, data.length, true);
    b.set(data, 44);
    const out = decodeWav(b);
    expect(out.length).toBe(16_000);
    expect(out[0]).toBe(1000);
    expect(out[8000]).toBe(1000);
    expect(out[15_999]).toBe(1000);
  });

  test("a file shorter than a header, or a wrong tag, is not a WAVE file", () => {
    expect(() => wavInfo(new TextEncoder().encode("RIFF\0\0\0\0WAV"))).toThrow("not a WAVE file");
    expect(() => wavInfo(new TextEncoder().encode("RIFF\0\0\0\0WAVX"))).toThrow("not a WAVE file");
    expect(() => wavInfo(new TextEncoder().encode("RIFX\0\0\0\0WAVE"))).toThrow("not a WAVE file");
  });
});
