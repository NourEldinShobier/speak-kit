import { describe, expect, it } from "vite-plus/test";
import { apply, compile, plain, type Phrase } from "../src/rules/phrases";

const table: Phrase[] = [
  { words: ["señor niño"], out: "A", join: "both" },
  { words: ["crème brûlée"], out: "B", join: "both" },
  { words: ["naïve côté"], out: "C", join: "next" },
  { words: ["façade"], out: "D", join: "prev" },
];

describe("phrases", () => {
  it("folds case and accents in the text and in the phrase", () => {
    const c = compile(table, false);
    expect(apply("x señor niño y", c)).toBe("xAy");
    expect(apply("x SENOR NINO y", c)).toBe("xAy");
    expect(apply("x SEÑOR   NIÑO y", c)).toBe("xAy");
    expect(apply("x creme brulee y", c)).toBe("xBy");
    expect(apply("x CRÈME BRÛLÉE y", c)).toBe("xBy");
    expect(apply("x crémé brülée y", c)).toBe("xBy");
    expect(apply("x naive cote y", c)).toBe("x Cy");
    expect(apply("x NAÏVE CÔTÉ y", c)).toBe("x Cy");
    expect(apply("x facade y", c)).toBe("xD y");
    expect(apply("x FAÇADE y", c)).toBe("xD y");
  });

  it("plain strips accents, lowercases and collapses whitespace", () => {
    expect(plain("  Crème \t Brûlée ")).toBe(" creme brulee ");
  });

  it("only matches whole words", () => {
    const c = compile(table, false);
    expect(apply("façades", c)).toBe("façades");
    expect(apply("afaçade", c)).toBe("afaçade");
    expect(apply("1façade", c)).toBe("1façade");
    expect(apply("façade1", c)).toBe("façade1");
  });

  it("swallows one punctuation mark after the phrase only when asked", () => {
    expect(apply("hello façade, world", compile(table, true))).toBe("helloD world");
    expect(apply("hello façade, world", compile(table, false))).toBe("helloD, world");
    expect(apply("hello façade. world", compile(table, true))).toBe("helloD world");
    expect(apply("hello façade; world", compile(table, true))).toBe("helloD world");
    expect(apply("hello façade! world", compile(table, true))).toBe("helloD world");
    expect(apply("hello façade? world", compile(table, true))).toBe("helloD world");
  });

  it("keeps the space after a prev join and before a next join only when there was one", () => {
    const c = compile(table, false);
    expect(apply("façade", c)).toBe("D");
    expect(apply("naïve côté", c)).toBe("C");
    expect(apply("a naïve côté", c)).toBe("a C");
  });
});
