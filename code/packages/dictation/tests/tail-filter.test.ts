import { describe, expect, it } from "vite-plus/test";
import { stripTailCredit } from "../src/tail-filter";

const rate = 16_000;
const tone = (s: number) => Float32Array.from({ length: rate * s }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 300 * i) / rate));
const speechThenSilence = (silentS: number) => {
  const a = tone(2);
  const out = new Float32Array(a.length + rate * silentS);
  out.set(a);
  return out;
};

describe("stripTailCredit", () => {
  it("removes an invented credit at the end of a recording that ended in silence", () => {
    expect(stripTailCredit("Send the report. Thanks for watching!", speechThenSilence(2), rate)).toBe("Send the report.");
    expect(stripTailCredit("Hallo zusammen. Untertitel im Auftrag des ZDF", speechThenSilence(2), rate)).toBe("Hallo zusammen.");
    expect(stripTailCredit("ok ترجمة نانسي قنقر", speechThenSilence(2), rate)).toBe("ok");
  });

  it("turns a transcript that is only the credit into nothing", () => {
    expect(stripTailCredit("Thank you for watching.", speechThenSilence(3), rate)).toBe("");
  });

  it("leaves the phrase alone when the person was still speaking at the end", () => {
    expect(stripTailCredit("Thanks for watching!", tone(3), rate)).toBe("Thanks for watching!");
  });

  it("only touches the very end, and only whole phrases", () => {
    const quiet = speechThenSilence(2);
    expect(stripTailCredit("Thanks for watching my talk", quiet, rate)).toBe("Thanks for watching my talk");
    expect(stripTailCredit("Ask me about unthanks for watching", quiet, rate)).toBe("Ask me about unthanks for watching");
    expect(stripTailCredit("Nothing to cut here", quiet, rate)).toBe("Nothing to cut here");
  });

  it("handles empty text and empty audio", () => {
    expect(stripTailCredit("", speechThenSilence(2), rate)).toBe("");
    expect(stripTailCredit("Thanks for watching", new Float32Array(0), rate)).toBe("");
  });
});
