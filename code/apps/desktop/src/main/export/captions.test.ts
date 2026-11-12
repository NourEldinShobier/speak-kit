import { describe, expect, it } from "vite-plus/test";
import { chaptersOf, headingsOf, id3Chapters, toSrt, toVtt, withChapters, type Cue } from "./captions";

const cue = (startMs: number, endMs: number, text: string): Cue => ({ startMs, endMs, text });
const cues = [cue(0, 1500, "First sentence."), cue(1750, 3_725_005, "Second one & <more>.")];

describe("captions", () => {
  it("writes SRT with numbered cues and comma milliseconds", () => {
    expect(toSrt(cues)).toBe("1\n00:00:00,000 --> 00:00:01,500\nFirst sentence.\n\n2\n00:00:01,750 --> 01:02:05,005\nSecond one & <more>.\n");
  });

  it("writes WebVTT with a header, dot milliseconds and escaped markup", () => {
    expect(toVtt(cues)).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nFirst sentence.\n\n00:00:01.750 --> 01:02:05.005\nSecond one &amp; &lt;more&gt;.\n");
  });

  it("never lets a cue run into the next one and gives a very short cue a moment", () => {
    expect(toSrt([cue(0, 5000, "a"), cue(2000, 2050, "b")])).toBe("1\n00:00:00,000 --> 00:00:02,000\na\n\n2\n00:00:02,000 --> 00:00:02,200\nb\n");
  });

  it("skips blank cues and numbers the rest from one", () => {
    expect(toSrt([cue(0, 100, "  "), cue(100, 900, "kept")])).toBe("1\n00:00:00,100 --> 00:00:00,900\nkept\n");
    expect(toSrt([])).toBe("");
    expect(toVtt([])).toBe("WEBVTT\n\n");
  });

  it("collapses line breaks inside a cue", () => {
    expect(toSrt([cue(0, 1000, "one\n\n two")])).toContain("\none two\n");
  });
});

describe("chapters", () => {
  const text = "# Intro\nHello there.\n\n## Part two\nMore text here.\nNo heading.";
  const spoken = [cue(0, 1000, "# Intro"), cue(1250, 2250, "Hello there."), cue(2500, 3500, "## Part two"), cue(3750, 5000, "More text here."), cue(5250, 6000, "No heading.")];

  it("finds markdown headings of every level", () => {
    expect(headingsOf(text)).toEqual(["Intro", "Part two"]);
    expect(headingsOf("no headings\n#hashtag\n####### seven")).toEqual([]);
    expect(headingsOf("### Closed ###")).toEqual(["Closed"]);
  });

  it("starts each chapter where its heading is spoken and ends it where the next starts", () => {
    expect(chaptersOf(text, spoken, 6000)).toEqual([
      { title: "Intro", startMs: 0, endMs: 2500 },
      { title: "Part two", startMs: 2500, endMs: 6000 },
    ]);
  });

  it("gives no chapter for a heading that was cut off, and none without headings", () => {
    expect(chaptersOf("# Gone\ntext", [cue(0, 10, "text")], 10)).toEqual([]);
    expect(chaptersOf("plain", [cue(0, 10, "plain")], 10)).toEqual([]);
  });

  it("finds repeated headings in order, not the first sentence again", () => {
    const t = "# Same\none\n# Same\ntwo";
    const c = [cue(0, 10, "# Same"), cue(20, 30, "one"), cue(40, 50, "# Same"), cue(60, 70, "two")];
    expect(chaptersOf(t, c, 70).map((x) => x.startMs)).toEqual([0, 40]);
  });
});

describe("ID3 chapter tag", () => {
  const chapters = [
    { title: "Intro", startMs: 0, endMs: 2500 },
    { title: "Größe", startMs: 2500, endMs: 6000 },
  ];

  it("has a version 2.3 header whose size covers every frame", () => {
    const tag = id3Chapters(chapters);
    expect(tag.subarray(0, 5)).toEqual(Buffer.from([0x49, 0x44, 0x33, 3, 0]));
    const size = (tag[6]! << 21) | (tag[7]! << 14) | (tag[8]! << 7) | tag[9]!;
    expect(tag.length).toBe(10 + size);
    expect([tag[6], tag[7], tag[8], tag[9]].every((b) => b! < 0x80)).toBe(true);
  });

  it("holds a table of contents and one chapter frame per chapter with start and end times", () => {
    const tag = id3Chapters(chapters);
    const s = tag.toString("latin1");
    expect(s.match(/CTOC/g)).toHaveLength(1);
    expect(s.match(/CHAP/g)).toHaveLength(2);
    const second = tag.indexOf("chp1\0", tag.indexOf("CHAP", tag.indexOf("CHAP") + 4));
    expect(tag.readUInt32BE(second + 5)).toBe(2500);
    expect(tag.readUInt32BE(second + 9)).toBe(6000);
    expect(tag.includes(Buffer.from("Größe", "utf16le"))).toBe(true);
  });

  it("is empty without chapters and leaves the MP3 alone", () => {
    expect(id3Chapters([])).toHaveLength(0);
    const mp3 = Uint8Array.from([0xff, 0xfb, 1, 2]);
    expect(withChapters(mp3, [])).toBe(mp3);
  });

  it("puts the tag in front of the audio, and does not stack a second tag", () => {
    const mp3 = Uint8Array.from([0xff, 0xfb, 1, 2]);
    const out = withChapters(mp3, chapters);
    expect(Buffer.from(out.subarray(0, 3)).toString("latin1")).toBe("ID3");
    expect([...out.subarray(out.length - 4)]).toEqual([0xff, 0xfb, 1, 2]);
    const tagged = Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0]);
    expect(withChapters(tagged, chapters)).toBe(tagged);
  });
});
