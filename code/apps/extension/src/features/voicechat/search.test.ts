import { describe, expect, it } from "vite-plus/test";
import { PageIndex, outline, passages } from "./search";

describe("passages", () => {
  it("joins short paragraphs up to 900 characters and cuts a longer one at a space", () => {
    const p = passages(`${"a".repeat(500)}\n\n${"b".repeat(500)}\n\n${"word ".repeat(400)}`);
    expect(p[0]).toBe("a".repeat(500));
    expect(p[1]!.startsWith("b".repeat(500))).toBe(true);
    expect(p.every((x) => x.length <= 900)).toBe(true);
    expect(p.join(" ").replace(/\s+/g, " ")).toContain("word word word");
  });
});

describe("outline", () => {
  const body = "This section holds enough words to be longer than its heading. It has a second sentence.";
  it("lists each heading with the first sentence of its section", () => {
    const text = ["Intro", body, "Tides", "Tides rise twice a day. More about tides.", "Tolls", body].join("\n\n");
    expect(outline(text)).toBe(
      ["Intro: This section holds enough words to be longer than its heading.", "Tides: Tides rise twice a day.", "Tolls: This section holds enough words to be longer than its heading."].join("\n"),
    );
  });

  it("falls back to the opening of each paragraph when the page has no headings, and never passes 8000 characters", () => {
    const text = Array.from({ length: 200 }, (_, i) => `Paragraph ${i} ${"x".repeat(200)}`).join("\n\n");
    const o = outline(text);
    expect(o.startsWith("Paragraph 0 ")).toBe(true);
    expect(o.length).toBeLessThanOrEqual(8000);
  });
});

describe("PageIndex", () => {
  const text = ["The morning ferry is run by Captain Okonkwo and is painted orange.", "The council votes on a second ferry next spring.", "Parking near the harbor costs two coins an hour."]
    .map((s) => `${s} ${"Filler words about the sea. ".repeat(30)}`)
    .join("\n\n");
  const index = new PageIndex(text);

  it("finds the passage that has the query words, best first", () => {
    expect(index.search("who runs the ferry captain")[0]).toContain("Captain Okonkwo");
    expect(index.search("parking cost")[0]).toContain("Parking near the harbor");
  });

  it("returns at most three passages and none when nothing matches", () => {
    const many = new PageIndex(Array.from({ length: 20 }, (_, i) => `ferry number ${i} ${"x ".repeat(400)}`).join("\n\n"));
    expect(many.search("ferry")).toHaveLength(3);
    expect(index.search("zebra")).toEqual([]);
    expect(index.search("")).toEqual([]);
  });

  it("matches words of other scripts", () => {
    const ar = new PageIndex("الميناء يستيقظ مبكرا\n\nالعبارة تعمل كل صباح");
    expect(ar.search("العبارة")[0]).toContain("العبارة");
  });
});
