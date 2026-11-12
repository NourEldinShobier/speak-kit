import { describe, expect, it } from "vite-plus/test";
import { encodeWav16k } from "@speakkit/transcripts";
import { baseName, decodeFile, inspectFile, type FilePorts } from "./decode";

const enc = (s: string) => new TextEncoder().encode(s.padEnd(16, "\0"));
const MP3 = enc("ID3\x04");

function ports(files: Record<string, Uint8Array>, page: FilePorts["decodeInPage"] = async () => ({ ok: true, pcm: new Int16Array(16000) })): FilePorts & { paused: number; pageCalls: number } {
  const p = {
    paused: 0,
    pageCalls: 0,
    stat: async (f: string) => (files[f] ? { size: files[f]!.length } : undefined),
    head: async (f: string, n: number) => files[f]!.subarray(0, n),
    read: async (f: string) => files[f]!,
    decodeInPage: async (b: Uint8Array) => (p.pageCalls++, page(b)),
    pause: async () => void p.paused++,
  };
  return p;
}

describe("file names", () => {
  it("takes the last part of a Windows or POSIX path", () => {
    expect(baseName("C:\\Users\\a\\talk.mp3")).toBe("talk.mp3");
    expect(baseName("/home/a/talk.mp3")).toBe("talk.mp3");
    expect(baseName("talk.mp3")).toBe("talk.mp3");
  });
});

describe("inspect", () => {
  it("accepts an audio file by its content and reports its size", async () => {
    expect(await inspectFile("/a/talk.mp3", ports({ "/a/talk.mp3": MP3 }))).toEqual({ ok: true, path: "/a/talk.mp3", name: "talk.mp3", bytes: 16 });
  });

  it("names a file that is not audio and lists the formats that work", async () => {
    const r = await inspectFile("/a/notes.mp3", ports({ "/a/notes.mp3": enc("hello") }));
    expect(r).toMatchObject({ ok: false, name: "notes.mp3", failure: { code: "unsupported" } });
    expect((r as { failure: { message: string } }).failure.message).toContain("WAV, MP3, M4A, FLAC and OGG");
  });

  it("a file that is missing or cannot be read fails as a decode error", async () => {
    expect(await inspectFile("/a/gone.wav", ports({}))).toMatchObject({ ok: false, failure: { code: "decode-failed" } });
    const broken = { ...ports({ "/a/x.wav": MP3 }), stat: async () => Promise.reject(new Error("EACCES")) };
    expect(await inspectFile("/a/x.wav", broken)).toMatchObject({ ok: false, failure: { code: "decode-failed" } });
    const noHead = { ...ports({ "/a/x.mp3": MP3 }), head: async () => Promise.reject(new Error("EIO")) };
    expect(await inspectFile("/a/x.mp3", noHead)).toMatchObject({ ok: false, failure: { code: "unsupported" } });
  });

  it("a file over the size limit is too large", async () => {
    const big = { ...ports({ "/a/b.mp3": MP3 }), stat: async () => ({ size: 500 * 1024 ** 2 }) };
    expect(await inspectFile("/a/b.mp3", big)).toMatchObject({ ok: false, failure: { code: "too-large" } });
  });
});

describe("decode", () => {
  it("a WAVE file is converted here, not in the page", async () => {
    const pcm = Int16Array.from({ length: 16000 }, (_, i) => (i % 100) * 10);
    const p = ports({ "/a/x.wav": encodeWav16k(pcm) });
    const r = await decodeFile("/a/x.wav", p);
    expect(r).toMatchObject({ ok: true, name: "x.wav" });
    expect(r.ok && [...r.pcm.subarray(0, 4)]).toEqual([0, 10, 20, 30]);
    expect(p.pageCalls).toBe(0);
  });

  it("other formats go through the page", async () => {
    const p = ports({ "/a/x.mp3": MP3 });
    const r = await decodeFile("/a/x.mp3", p);
    expect(r).toMatchObject({ ok: true, name: "x.mp3" });
    expect(p.pageCalls).toBe(1);
  });

  it("a page that cannot decode, or finds the audio too long, gives the matching message", async () => {
    expect(await decodeFile("/a/x.mp3", ports({ "/a/x.mp3": MP3 }, async () => ({ ok: false, code: "decode-failed" })))).toMatchObject({ ok: false, failure: { code: "decode-failed" } });
    expect(await decodeFile("/a/x.mp3", ports({ "/a/x.mp3": MP3 }, async () => ({ ok: false, code: "too-long" })))).toMatchObject({ ok: false, failure: { code: "too-long" } });
    expect(await decodeFile("/a/x.mp3", ports({ "/a/x.mp3": MP3 }, async () => Promise.reject(new Error("page gone"))))).toMatchObject({ ok: false, failure: { code: "decode-failed" } });
  });

  it("decoded audio over four hours is refused, empty audio is a decode error", async () => {
    const long = ports({ "/a/x.mp3": MP3 }, async () => ({ ok: true, pcm: new Int16Array(4 * 3600 * 16000 + 1) }));
    expect(await decodeFile("/a/x.mp3", long)).toMatchObject({ ok: false, failure: { code: "too-long" } });
    const exactly = ports({ "/a/x.mp3": MP3 }, async () => ({ ok: true, pcm: new Int16Array(4 * 3600 * 16000) }));
    expect(await decodeFile("/a/x.mp3", exactly)).toMatchObject({ ok: true });
    const empty = ports({ "/a/x.mp3": MP3 }, async () => ({ ok: true, pcm: new Int16Array(0) }));
    expect(await decodeFile("/a/x.mp3", empty)).toMatchObject({ ok: false, failure: { code: "decode-failed" } });
  });

  it("a damaged WAVE file and a file that cannot be read are decode errors; an unsupported file never reaches a decoder", async () => {
    const damaged = ports({ "/a/x.wav": Uint8Array.from([...new TextEncoder().encode("RIFF\0\0\0\0WAVEjunkjunk"), 0, 0, 0, 0]) });
    expect(await decodeFile("/a/x.wav", damaged)).toMatchObject({ ok: false, failure: { code: "decode-failed" } });
    const unreadable = { ...ports({ "/a/x.mp3": MP3 }), read: async () => Promise.reject(new Error("EBUSY")) };
    expect(await decodeFile("/a/x.mp3", unreadable)).toMatchObject({ ok: false, failure: { code: "decode-failed" } });
    const p = ports({ "/a/t.txt": enc("plain text") });
    expect(await decodeFile("/a/t.txt", p)).toMatchObject({ ok: false, failure: { code: "unsupported" } });
    expect(p.pageCalls).toBe(0);
  });
});
