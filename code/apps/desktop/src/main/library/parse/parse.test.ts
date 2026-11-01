import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { ImportError, parseFile } from ".";
import { pageBlocks, stripRunning, type PdfItem } from "./pdf-layout";
import { textToBlocks, wordCount } from "../../../shared/library/text";

const fixture = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))));
const texts = (blocks: { text: string }[]) => blocks.map((b) => b.text);

describe("text", () => {
  it("joins soft-wrapped lines inside a paragraph and splits on blank lines", async () => {
    const { parsed, format } = await parseFile("plain.txt", fixture("plain.txt"));
    expect(format).toBe("text");
    expect(texts(parsed.blocks)).toEqual(["First paragraph that wraps onto a second line.", "Second paragraph."]);
  });

  it("makes one paragraph per line when the text has no blank line", () => {
    expect(texts(textToBlocks("one\ntwo\r\nthree"))).toEqual(["one", "two", "three"]);
  });

  it("counts words", () => {
    expect(wordCount(textToBlocks("a b c\n\nd e"))).toBe(5);
  });
});

describe("markdown", () => {
  it("keeps headings, paragraphs, items and quotes as plain text and drops code", async () => {
    const { parsed } = await parseFile("notes.md", fixture("notes.md"));
    expect(parsed.title).toBe("Meeting notes");
    expect(parsed.blocks).toEqual([
      { kind: "heading", text: "Meeting notes", level: 1 },
      { kind: "paragraph", text: "We agreed on three things:" },
      { kind: "list-item", text: "ship the library" },
      { kind: "list-item", text: "fix the parser" },
      { kind: "quote", text: "Quote of the week" },
      { kind: "heading", text: "Next steps", level: 2 },
      { kind: "paragraph", text: "Talk on Monday." },
    ]);
  });
});

describe("html", () => {
  it("extracts the article with its title and leaves out navigation and footer", async () => {
    const { parsed, format } = await parseFile("article.html", fixture("article.html"));
    expect(format).toBe("html");
    expect(parsed.title).toContain("The quiet return of local-first software");
    const t = texts(parsed.blocks);
    expect(t.some((x) => x.startsWith("For a decade, the default answer"))).toBe(true);
    expect(t).toContain("Why now");
    expect(t.join(" ")).not.toMatch(/Copyright|About/);
  });
});

describe("docx", () => {
  it("keeps the heading and each paragraph, joining runs", async () => {
    const { parsed } = await parseFile("sample.docx", fixture("sample.docx"));
    expect(parsed.blocks).toEqual([
      { kind: "heading", text: "Thesis chapter", level: 1 },
      { kind: "paragraph", text: "First paragraph of the chapter." },
      { kind: "paragraph", text: "Second paragraph, with two runs." },
    ]);
  });
});

describe("epub", () => {
  it("reads the chapters in spine order with the book title", async () => {
    const { parsed } = await parseFile("sample.epub", fixture("sample.epub"));
    expect(parsed.title).toBe("A Small Book");
    expect(parsed.blocks).toEqual([
      { kind: "heading", text: "Chapter one", level: 1 },
      { kind: "paragraph", text: "It was a quiet morning." },
      { kind: "heading", text: "Chapter two", level: 1 },
      { kind: "paragraph", text: "Then the day began." },
    ]);
  });
});

describe("pdf", () => {
  it("builds headings and paragraphs, repairs hyphenation and drops the running footer", async () => {
    const { parsed } = await parseFile("sample.pdf", fixture("sample.pdf"));
    expect(parsed.pages).toBe(3);
    expect(parsed.needsOcr).toBe(false);
    expect(parsed.blocks).toEqual([
      { kind: "heading", text: "Local First Software", level: 1, page: 1 },
      { kind: "paragraph", text: "For a decade the default answer to every software question was the cloud. Notes and documents lived on someone else’s server.", page: 1 },
      { kind: "paragraph", text: "The appeal is simple. When the work happens on your own machine it keeps working on a plane.", page: 1 },
      { kind: "paragraph", text: "Second page paragraph one stays on its own page.", page: 2 },
      { kind: "paragraph", text: "Third page text.", page: 3 },
    ]);
  });

  it("flags a PDF without a text layer for OCR instead of failing", async () => {
    const { parsed } = await parseFile("scanned.pdf", fixture("scanned.pdf"));
    expect(parsed).toMatchObject({ blocks: [], pages: 2, needsOcr: true });
  });
});

describe("pdf layout", () => {
  const item = (str: string, x: number, y: number, h = 12, w = str.length * 6): PdfItem => ({ str, x, y, w, h });

  it("joins runs on one baseline in reading order with a space between words", () => {
    const blocks = pageBlocks([item("world", 100, 700), item("Hello", 60, 700), item("again", 160, 700)], 12, 1);
    expect(texts(blocks)).toEqual(["Hello world again"]);
  });

  it("starts a paragraph at an indented line after a sentence end", () => {
    const blocks = pageBlocks([item("Line one ends here.", 72, 700), item("Indented start continues", 100, 686), item("on a second line", 72, 672)], 12, 1);
    expect(texts(blocks)).toEqual(["Line one ends here.", "Indented start continues on a second line"]);
  });

  it("removes a first or last line that repeats on most pages, and bare page numbers", () => {
    const page = (n: number) => [
      { kind: "paragraph" as const, text: `Report 2026 page ${n}` },
      { kind: "paragraph" as const, text: `Body ${n}` },
      { kind: "paragraph" as const, text: String(n) },
    ];
    expect(stripRunning([page(1), page(2), page(3)]).map(texts)).toEqual([["Body 1"], ["Body 2"], ["Body 3"]]);
  });
});

describe("parseFile errors", () => {
  it("names the supported types for an unsupported file", async () => {
    await expect(parseFile("movie.mp4", new Uint8Array([1]))).rejects.toMatchObject({ reason: "unsupported", message: expect.stringContaining("PDF") });
  });

  it("rejects an empty text file", async () => {
    await expect(parseFile("a.txt", new Uint8Array())).rejects.toBeInstanceOf(ImportError);
  });

  it("reports a broken PDF as unreadable", async () => {
    await expect(parseFile("bad.pdf", new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ reason: "unreadable" });
  });
});
