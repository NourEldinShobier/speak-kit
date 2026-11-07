import { describe, expect, it, test } from "vite-plus/test";
import { splitMany, splitSentences } from "./sentences";

const texts = (s: { text: string }[]) => s.map((x) => x.text);

describe("splitSentences", () => {
  it("splits at sentence ends and keeps character spans into the source", () => {
    const text = "First one. Second one! Third?";
    const s = splitSentences(text);
    expect(s.map((x) => x.text)).toEqual(["First one.", "Second one!", "Third?"]);
    expect(s.map((x) => text.slice(x.start, x.end))).toEqual(["First one.", "Second one!", "Third?"]);
  });

  it("caps a very long sentence at a clause boundary", () => {
    const long = `${"word ".repeat(30).trim()}, ${"more ".repeat(40).trim()}.`;
    const s = splitSentences(long);
    expect(s.length).toBeGreaterThan(1);
    expect(s.every((x) => x.text.length <= 300)).toBe(true);
    expect(s[0]!.text.endsWith(",")).toBe(true);
  });
});

describe("splitSentences, longer cases", () => {
  test("merges abbreviations and initials with the next sentence", () => {
    const t = "Dr. Smith met Prof. Lee at 5 p.m. in Washington, D.C. on Jan. 5. They agreed, e.g. on the budget. J. R. Tolkien wrote it. Then they left.";
    expect(texts(splitSentences(t))).toEqual(["Dr. Smith met Prof. Lee at 5 p.m. in Washington, D.C. on Jan. 5.", "They agreed, e.g. on the budget.", "J. R. Tolkien wrote it.", "Then they left."]);
  });

  test("keeps question and exclamation marks, quotes and ellipses attached", () => {
    expect(texts(splitSentences('Is it ready? Yes! "Of course," she said. Wait... then go.'))).toEqual(["Is it ready?", "Yes!", '"Of course," she said.', "Wait... then go."]);
  });

  test("offsets point at the trimmed sentence inside the original text", () => {
    const t = "First one.   Second one.";
    for (const s of splitSentences(t)) expect(t.slice(s.start, s.end)).toBe(s.text);
  });

  test("caps long sentences at clause boundaries, never inside a word, without losing words", () => {
    const long = "Alpha beta gamma delta epsilon, ".repeat(20).trim() + " and the end comes here.";
    const parts = splitSentences(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.text.length).toBeLessThanOrEqual(300);
    expect(
      parts
        .map((p) => p.text)
        .join(" ")
        .replace(/\s+/g, " "),
    ).toBe(long.replace(/\s+/g, " "));
  });

  test("a long text without any clause punctuation is cut at a space", () => {
    const long = "word ".repeat(200).trim() + ".";
    const parts = splitSentences(long);
    for (const p of parts) {
      expect(p.text.length).toBeLessThanOrEqual(300);
      expect(p.text.startsWith("word")).toBe(true);
    }
  });

  test("drops pieces without letters or digits, merges stray punctuation into the sentence before it", () => {
    expect(texts(splitSentences("* * *"))).toEqual([]);
    expect(texts(splitSentences("Hello there. ... Another one."))).toEqual(["Hello there. ...", "Another one."]);
  });

  test("sentence ends without a following space split Chinese, Japanese, Hindi and Arabic text", () => {
    expect(texts(splitSentences("今天天气很好。我们去公园散步吧！", "zh"))).toEqual(["今天天气很好。", "我们去公园散步吧！"]);
    expect(texts(splitSentences("東京は大きな都市です。私は毎日電車で通勤します。", "ja"))).toEqual(["東京は大きな都市です。", "私は毎日電車で通勤します。"]);
    expect(texts(splitSentences("यह एक परीक्षण वाक्य है। दूसरा वाक्य यहाँ है।", "hi"))).toEqual(["यह एक परीक्षण वाक्य है।", "दूसरा वाक्य यहाँ है।"]);
    expect(texts(splitSentences("هل أنت بخير؟نعم أنا بخير.", "ar"))).toEqual(["هل أنت بخير؟", "نعم أنا بخير."]);
  });

  test("batch splitting equals one-by-one splitting", () => {
    const blocks = ["One. Two.", "Single sentence without a stop", "Dr. A went home. Then he slept.", ""];
    expect(splitMany(blocks)).toEqual(blocks.map((b) => splitSentences(b)));
  });
});
