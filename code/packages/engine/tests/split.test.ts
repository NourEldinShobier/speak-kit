import { describe, expect, it } from "vite-plus/test";
import { splitLong } from "../src/split";

describe("splitLong", () => {
  it("keeps short text whole", () => {
    expect(splitLong("Hello there.", 300)).toEqual(["Hello there."]);
  });
  it("splits at the latest sentence end inside the window", () => {
    const s = "First sentence is here. Second sentence is also here. Third one finishes the text.";
    expect(splitLong(s, 60)).toEqual(["First sentence is here. Second sentence is also here.", "Third one finishes the text."]);
  });
  it("falls back to clause, then word, then hard cut", () => {
    expect(splitLong("alpha beta gamma, delta epsilon zeta eta theta", 30)).toEqual(["alpha beta gamma,", "delta epsilon zeta eta theta"]);
    expect(splitLong("aaaa bbbb cccc dddd eeee ffff gggg", 15)).toEqual(["aaaa bbbb cccc", "dddd eeee ffff", "gggg"]);
    expect(splitLong("x".repeat(25), 10)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });
  it("never exceeds max and loses no words", () => {
    const text = Array.from({ length: 400 }, (_, i) => `word${i}${i % 7 === 0 ? "," : ""}`).join(" ");
    const parts = splitLong(text, 300);
    expect(parts.every((p) => p.length <= 300)).toBe(true);
    expect(parts.join(" ")).toBe(text);
  });
});
