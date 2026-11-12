import { describe, expect, it } from "vite-plus/test";
import { formatReport, recall, wordErrorRate, words } from "../src/stt/compare";

describe("words", () => {
  it("lower-cases and drops punctuation but keeps apostrophes and other scripts", () => {
    expect(words("Hello, World! It's 9:41.")).toEqual(["hello", "world", "it's", "9", "41"]);
    expect(words("Grüße aus Köln")).toEqual(["grüße", "aus", "köln"]);
    expect(words("مرحبا بالعالم")).toEqual(["مرحبا", "بالعالم"]);
    expect(words("   ")).toEqual([]);
  });
});

describe("wordErrorRate", () => {
  it("is 0 for the same words whatever the case and punctuation", () => {
    expect(wordErrorRate("Hello, world", "hello world")).toBe(0);
  });
  it("counts a substitution, an insertion and a deletion each as one edit", () => {
    expect(wordErrorRate("a b c d", "a x c d")).toBe(0.25);
    expect(wordErrorRate("a b c d", "a b c d e")).toBe(0.25);
    expect(wordErrorRate("a b c d", "a b d")).toBe(0.25);
  });
  it("is 1 when nothing matches and can exceed 1 for a long wrong answer", () => {
    expect(wordErrorRate("a b", "x y")).toBe(1);
    expect(wordErrorRate("a", "x y z")).toBe(3);
  });
  it("handles empty text", () => {
    expect(wordErrorRate("", "")).toBe(0);
    expect(wordErrorRate("", "something")).toBe(1);
    expect(wordErrorRate("a b", "")).toBe(1);
  });
});

describe("recall", () => {
  it("is the share of reference words that were heard, each heard word used once", () => {
    expect(recall("the cat sat", "the cat")).toBeCloseTo(2 / 3);
    expect(recall("the the cat", "the cat")).toBeCloseTo(2 / 3);
    expect(recall("a b", "b a")).toBe(1);
  });
  it("is 1 for an empty reference and 0 for no match", () => {
    expect(recall("", "anything")).toBe(1);
    expect(recall("a b", "x")).toBe(0);
    expect(recall("a b", "")).toBe(0);
  });
});

describe("formatReport", () => {
  it("names the recording and the model file on every line and ends with one average per model file", () => {
    const out = formatReport([
      { recording: "one.wav", modelFile: "a.bin", recall: 1, wer: 0, latencyMs: 400 },
      { recording: "two.wav", modelFile: "a.bin", recall: 0.5, wer: 0.5, latencyMs: 600 },
      { recording: "one.wav", modelFile: "b.bin", recall: 0.9, wer: 0.1, latencyMs: 100 },
    ]);
    expect(out.split("\n")).toEqual([
      "a.bin  one.wav  recall 100.0%  wer 0.0%  400 ms",
      "a.bin  two.wav  recall 50.0%  wer 50.0%  600 ms",
      "b.bin  one.wav  recall 90.0%  wer 10.0%  100 ms",
      "a.bin  average of 2  recall 75.0%  wer 25.0%  500 ms",
      "b.bin  average of 1  recall 90.0%  wer 10.0%  100 ms",
    ]);
  });
  it("is empty without rows", () => {
    expect(formatReport([])).toBe("");
  });
});
