import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Detail } from "@speakkit/transcripts/pure";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {}, speakkitTranscripts: {} };
});

import { ChapterList, SummaryCard } from "./TranscriptNotes";

const doc = {
  title: "Plan",
  summary: "They agreed the date. Nothing else.",
  writer: "OpenAI m",
  at: 1,
  chapters: [
    { start: 0, title: "Date", text: "a" },
    { start: 3725, title: "Budget", text: "b" },
  ],
};
const detail = (notes: Detail["notes"], status: Detail["status"] = "done"): Detail =>
  ({
    id: "t1",
    title: "T",
    createdAt: 1,
    durationSec: 10,
    source: "file",
    language: "en",
    status,
    chunksDone: 1,
    chunksTotal: 1,
    audioBytes: 0,
    audioRemoved: true,
    daysLeft: null,
    segments: [],
    exports: [],
    ...(notes && { notes }),
  }) as Detail;
const html = (d: Detail) => renderToStaticMarkup(<SummaryCard detail={d} reload={() => {}} />);

describe("summary card", () => {
  it("names the writer under the summary and offers writing again", () => {
    const h = html(detail({ state: "ready", doc }));
    expect(h).toContain("They agreed the date. Nothing else.");
    expect(h).toContain("Written by OpenAI m.");
    expect(h).toContain("Write notes again");
  });

  it("a failure says what happened and keeps the earlier summary visible", () => {
    const h = html(detail({ state: "failed", failure: { code: "notes", message: "OpenAI is busy. The transcript is unchanged." }, doc }));
    expect(h).toContain("Notes could not be written");
    expect(h).toContain("OpenAI is busy. The transcript is unchanged.");
    expect(h).toContain("They agreed the date.");
  });

  it("shows only a banner while writing, and nothing when notes were never asked for or the transcript is not done", () => {
    expect(html(detail({ state: "writing" }))).toContain("Writing the notes");
    expect(html(detail(undefined))).toBe("");
    expect(html(detail({ state: "ready", doc }, "transcribing"))).toBe("");
  });
});

describe("chapter list", () => {
  it("lists chapters with their times and a named Copy section button each", () => {
    const h = renderToStaticMarkup(<ChapterList detail={detail({ state: "ready", doc })} onCopied={() => {}} />);
    expect(h).toContain("2 chapters");
    expect(h).toContain("1:02:05");
    expect(h).toContain('aria-label="Copy section: Budget"');
  });

  it("renders nothing without chapters", () => {
    expect(renderToStaticMarkup(<ChapterList detail={detail({ state: "ready", doc: { ...doc, chapters: [] } })} onCopied={() => {}} />)).toBe("");
  });
});

import { TranscriptRow } from "./TranscriptRow";

describe("list row", () => {
  const row = (notesState?: "writing" | "ready" | "failed") =>
    renderToStaticMarkup(
      <TranscriptRow
        row={{
          id: "t1",
          title: "Call",
          createdAt: 1,
          durationSec: 5,
          source: "file",
          language: "en",
          status: "done",
          chunksDone: 1,
          chunksTotal: 1,
          audioBytes: 0,
          audioRemoved: true,
          daysLeft: 3,
          ...(notesState && { notesState }),
        }}
        now={2}
        audioDays={7}
        onOpen={() => {}}
        onDelete={() => {}}
        onCancel={() => {}}
        onResume={() => {}}
        onExport={() => {}}
      />,
    );
  it("says Writing notes only while the notes are being written", () => {
    expect(row("writing")).toContain("Writing notes");
    expect(row("ready")).not.toContain("Writing notes");
    expect(row()).not.toContain("Writing notes");
  });
});
