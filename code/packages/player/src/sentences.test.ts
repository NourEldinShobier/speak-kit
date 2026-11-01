import { describe, expect, it } from "vite-plus/test";
import { splitSentences } from "./sentences";

describe("splitSentences", () => {
  it("splits at sentence ends and keeps character spans into the source", () => {
    const text = "First one. Second one! Third?";
    const s = splitSentences(text);
    expect(s.map((x) => x.text)).toEqual(["First one.", "Second one!", "Third?"]);
    expect(s.map((x) => text.slice(x.start, x.end))).toEqual(["First one.", "Second one!", "Third?"]);
  });

  it("does not split after an abbreviation", () => {
    expect(splitSentences("Dr. Smith met Mr. Jones at 5 p.m. today. They left.").map((x) => x.text)).toEqual(["Dr. Smith met Mr. Jones at 5 p.m. today.", "They left."]);
  });

  it("caps a very long sentence at a clause boundary", () => {
    const long = `${"word ".repeat(30).trim()}, ${"more ".repeat(40).trim()}.`;
    const s = splitSentences(long);
    expect(s.length).toBeGreaterThan(1);
    expect(s.every((x) => x.text.length <= 300)).toBe(true);
    expect(s[0]!.text.endsWith(",")).toBe(true);
  });

  it("drops pieces without letters or digits", () => {
    expect(splitSentences("...").length).toBe(0);
  });
});
