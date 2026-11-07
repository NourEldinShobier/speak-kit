import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { DocMeta } from "../../../shared/library/contract";
import { DocRow } from "./DocRow";

const NOW = Date.UTC(2026, 5, 15, 12);
const doc = (over: Partial<DocMeta> = {}): DocMeta => ({
  id: "d1",
  title: "Local-first software",
  source: "url",
  format: "url",
  origin: "example.com",
  addedAt: NOW,
  wordCount: 1500,
  progress: { sentence: 0, fraction: 0 },
  finished: false,
  ...over,
});
const row = (d: DocMeta, query = "", hit?: { id: string; snippet?: string } | undefined) =>
  renderToStaticMarkup(
    <DocRow doc={d} speed={1} now={NOW} query={query} hit={hit} actions={{ onOpen() {}, onPlay() {}, onRename() {}, onVoice() {}, onFinished() {}, onReveal() {}, onDelete() {} }} />,
  );

describe("DocRow", () => {
  it("a new reading shows the New badge, its estimated length and an open button named after it", () => {
    const html = row(doc());
    expect(html).toContain('aria-label="Open Local-first software"');
    expect(html).toContain("New");
    expect(html).toContain("10:00");
  });

  it("a reading in progress shows a progress bar with the percentage", () => {
    const html = row(doc({ progress: { sentence: 12, fraction: 0.4 }, openedAt: NOW }));
    expect(html).toContain('aria-label="40% read"');
    expect(html).not.toContain(">New<");
  });

  it("a finished reading shows Finished; a scanned PDF says Scanned instead of a length", () => {
    expect(row(doc({ finished: true, progress: { sentence: 0, fraction: 1 } }))).toContain("Finished");
    expect(row(doc({ format: "pdf", needsOcr: true, wordCount: 0 }))).toContain("Scanned");
  });

  it("marks the search words in the title and shows the matching snippet", () => {
    const html = row(doc(), "local", { id: "d1", snippet: "...a local copy..." });
    expect(html).toContain('<mark class="lib-mark">Local</mark>-first software');
    expect(html).toContain('<mark class="lib-mark">local</mark> copy');
  });
});

describe("DocRow menu button", () => {
  it("is the 28 px secondary icon button (white, ring, shadow)", () => {
    const html = row(doc());
    expect(html).toContain('class="lm-btn lm-btn--icon lm-btn--secondary lm-btn--sm"');
    expect(html).toContain('aria-label="More for Local-first software"');
  });
});
