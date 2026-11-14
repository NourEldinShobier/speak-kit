import { describe, expect, it } from "vite-plus/test";
import { spaceBefore } from "../src/spacing";

const at = (before: string, selected = false) => ({ before, selected });

describe("spaceBefore", () => {
  it.each([
    ["a letter", "d", "next", " next"],
    ["a digit", "7", "items", " items"],
    ["a full stop", ".", "Next", " Next"],
    ["a closing bracket", ")", "then", " then"],
    ["a closing quote", "”", "said", " said"],
    ["a letter with an accent", "é", "ok", " ok"],
    ["an arabic letter", "ب", "مرحبا", " مرحبا"],
  ])("adds a space after %s", (_name, before, text, expected) => expect(spaceBefore(text, at(before))).toBe(expected));

  it.each([
    ["a space", " "],
    ["a line break", "\n"],
    ["a tab", "\t"],
    ["an opening bracket", "("],
    ["the start of the field", ""],
    ["an emoji", "\u{1F600}"],
  ])("adds nothing after %s", (_name, before) => expect(spaceBefore("next", at(before))).toBe("next"));

  it.each([".", ",", ";", ":", "!", "?", ")", "]", "}", "%", '"', "'", "’", "”", "»", "…"])("adds a space after the closing mark %s", (mark) => {
    expect(spaceBefore("next", at(mark))).toBe(" next");
  });

  it.each(["(", "[", "{", "-", "/", "@", "#", "$"])("adds nothing after the opening or joining mark %s", (mark) => {
    expect(spaceBefore("next", at(mark))).toBe("next");
  });

  it("adds nothing when text is selected, because the paste replaces it", () => expect(spaceBefore("next", at("d", true))).toBe("next"));
  it("adds nothing when the field could not be read", () => expect(spaceBefore("next", undefined)).toBe("next"));
  it("adds nothing before text that starts with a space or punctuation", () => {
    expect(spaceBefore(" next", at("d"))).toBe(" next");
    expect(spaceBefore(", next", at("d"))).toBe(", next");
    expect(spaceBefore("?", at("d"))).toBe("?");
    expect(spaceBefore("\nnext", at("d"))).toBe("\nnext");
  });
  it("leaves empty text empty", () => expect(spaceBefore("", at("d"))).toBe(""));
  it("looks at the last whole character, not half of a surrogate pair", () => expect(spaceBefore("x", at("a\u{1F600}"))).toBe("x"));
});
