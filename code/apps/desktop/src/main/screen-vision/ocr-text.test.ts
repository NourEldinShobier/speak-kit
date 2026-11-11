import { describe, expect, it } from "vite-plus/test";
import { parseOcrReply, readingOrder, type OcrLine } from "./ocr-text";

const L = (t: string, x: number, y: number, w = 100, h = 20): OcrLine => ({ t, x, y, w, h });

describe("parseOcrReply", () => {
  it("reads a result, an error and the ready line", () => {
    expect(parseOcrReply('{"id":3,"lang":"en-US","lines":[{"t":"Hi","x":1,"y":2,"w":3,"h":4}]}')).toEqual({ id: 3, lang: "en-US", lines: [{ t: "Hi", x: 1, y: 2, w: 3, h: 4 }] });
    expect(parseOcrReply('{"id":4,"error":"boom"}')).toEqual({ id: 4, error: "boom" });
    expect(parseOcrReply('{"ready":true,"lang":null}')).toEqual({ ready: true, lang: null });
  });

  it.each(["", "not json", "{}", '{"id":"1","lines":[]}', '{"id":1,"lang":"en","lines":[{"t":"x"}]}', '{"ready":false,"lang":null}', "[1]"])("returns undefined for %j", (line) => {
    expect(parseOcrReply(line)).toBeUndefined();
  });
});

describe("readingOrder", () => {
  it("sorts lines top to bottom whatever order they came in", () => {
    expect(readingOrder([L("third", 10, 200), L("first", 10, 10), L("second", 10, 100)])).toBe("first\nsecond\nthird");
  });

  it("puts a label and its value on one row, left to right, even when the recognizer gave them far apart", () => {
    const lines = [L("Voice", 20, 100, 60), L("Footer", 20, 400), L("marin", 200, 102, 60), L("Speed", 20, 140, 60), L("1.0x", 200, 141, 40)];
    expect(readingOrder(lines)).toBe("Voice  marin\nSpeed  1.0x\nFooter".replace("Voice  marin", "Voice | marin").replace("Speed  1.0x", "Speed | 1.0x"));
  });

  it("separates by gap: a space for neighbours, two for a column step, a bar for far apart", () => {
    expect(readingOrder([L("a", 0, 0, 40), L("b", 50, 0, 40)])).toBe("a b");
    expect(readingOrder([L("a", 0, 0, 40), L("b", 100, 0, 40)])).toBe("a  b");
    expect(readingOrder([L("a", 0, 0, 40), L("b", 400, 0, 40)])).toBe("a | b");
  });

  it("keeps two lines apart when they only overlap a little vertically", () => {
    expect(readingOrder([L("upper", 0, 0), L("lower", 0, 15)])).toBe("upper\nlower");
  });

  it("drops blank lines and trims the text", () => {
    expect(readingOrder([L("  padded  ", 0, 0), L("   ", 0, 50), L("", 0, 90)])).toBe("padded");
  });

  it("gives an empty string for no lines", () => {
    expect(readingOrder([])).toBe("");
  });

  it("cuts a long text and says so", () => {
    const lines = Array.from({ length: 50 }, (_, i) => L("x".repeat(100), 0, i * 40));
    const text = readingOrder(lines, 1000);
    expect(text).toHaveLength(1000 + "\n[text cut]".length);
    expect(text.endsWith("\n[text cut]")).toBe(true);
    expect(readingOrder(lines.slice(0, 5), 1000)).not.toContain("[text cut]");
  });
});
