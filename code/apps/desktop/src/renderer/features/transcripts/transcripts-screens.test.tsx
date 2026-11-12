import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Row } from "@speakkit/transcripts/pure";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {}, speakkitTranscripts: {} };
});

import { Marked } from "./Marked";
import { TranscriptRow } from "./TranscriptRow";

const NOW = new Date(2026, 10, 12, 15, 0).getTime();
const row = (over: Partial<Row> = {}): Row => ({
  id: "t1",
  title: "Weekly planning with Priya",
  createdAt: new Date(2026, 10, 12, 14, 10).getTime(),
  durationSec: 38 * 60,
  source: "microphone",
  language: "auto",
  status: "done",
  chunksDone: 4,
  chunksTotal: 4,
  audioBytes: 1000,
  audioRemoved: false,
  daysLeft: 29,
  ...over,
});
const noop = () => {};
const html = (r: Row, extra: Partial<Parameters<typeof TranscriptRow>[0]> = {}) =>
  renderToStaticMarkup(<TranscriptRow row={r} now={NOW} audioDays={7} onOpen={noop} onDelete={noop} onCancel={noop} onResume={noop} onExport={noop} {...extra} />);

describe("transcript row", () => {
  it("a finished recording shows title, kind, audio retention, length, date and days left, with named buttons", () => {
    const h = html(row());
    expect(h).toContain("Weekly planning with Priya");
    expect(h).toContain("Recorded");
    expect(h).toContain("audio kept 7 more days");
    expect(h).toContain("38 min");
    expect(h).toContain("Today, 2:10 PM");
    expect(h).toContain("Removed in 29 days");
    expect(h).toContain('aria-label="Open: Weekly planning with Priya"');
    expect(h).toContain('aria-label="Export: Weekly planning with Priya"');
    expect(h).toContain('aria-label="Delete: Weekly planning with Priya"');
  });

  it("an imported file shows its file name and no audio line", () => {
    const h = html(row({ source: "file", sourceName: "lecture-4.mp3", title: "Lecture 4", audioBytes: 0, daysLeft: null }));
    expect(h).toContain("Imported");
    expect(h).toContain("lecture-4.mp3");
    expect(h).not.toContain("audio kept");
    expect(h).not.toContain("Removed in");
  });

  it("a long title wraps instead of widening the row", () => {
    expect(html(row({ title: "A".repeat(300) }))).toContain("tr-row__title");
  });

  it("a job in progress shows its progress and Cancel, and no Open, Export or Delete", () => {
    const h = html(row({ status: "transcribing", chunksDone: 3, chunksTotal: 4, durationSec: 1200, audioBytes: 0, daysLeft: null }));
    expect(h).toContain("15 of 20 min transcribed");
    expect(h).toContain('aria-valuenow="75"');
    expect(h).toContain('aria-label="Cancel: Weekly planning with Priya"');
    expect(h).not.toContain("Export:");
  });

  it("a waiting job says its place in the line", () => {
    expect(html(row({ status: "queued", queued: 2 }))).toContain("Waiting, number 2 in line");
  });

  it("a failed job shows why in an alert, with Try again and Delete", () => {
    const h = html(row({ status: "failed", failure: { code: "engine-missing", message: "No speech model is installed. Download one in Dictation, then try again." } }));
    expect(h).toContain('role="alert"');
    expect(h).toContain("No speech model is installed");
    expect(h).toContain("Try again: Weekly planning with Priya");
    expect(h).toContain("Delete: Weekly planning with Priya");
  });

  it("a failed job with nothing saved can only be deleted (a failed recording is always deletable)", () => {
    const h = html(row({ status: "failed", audioBytes: 0, chunksDone: 0, failure: { code: "failed", message: "x" } }));
    expect(h).not.toContain("Try again:");
    expect(h).toContain("Delete: Weekly planning with Priya");
  });

  it("an interrupted or stopped job offers Resume; a recovered one is tagged", () => {
    expect(html(row({ status: "interrupted" }))).toContain("Resume: Weekly planning with Priya");
    expect(html(row({ status: "cancelled" }))).toContain("Stopped before it finished.");
    expect(html(row({ status: "interrupted", recovered: true }))).toContain("Recovered");
  });

  it("a search result shows the words around the match with the match marked", () => {
    const h = html(row({ snippet: "…pay the invoice today…" }), { query: "invoice" });
    expect(h).toContain('<mark class="tr-mark">invoice</mark>');
  });
});

describe("marked text", () => {
  it("wraps each typed word; text without a query is left alone", () => {
    expect(renderToStaticMarkup(<Marked text="Pay the invoice" query="pay" />)).toBe('<mark class="tr-mark">Pay</mark> the invoice');
    expect(renderToStaticMarkup(<Marked text="Pay the invoice" query="" />)).toBe("Pay the invoice");
  });
});
