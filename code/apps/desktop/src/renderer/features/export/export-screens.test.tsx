import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ExportView } from "../../../shared/export";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { appState } from "../../app-state.fixture";
import { doneView, renderingView } from "./JobViews";
import { initExport } from "./model";
import { optionsView } from "./OptionsView";

const job: ExportView = { id: "x1", name: "chapter.mp3", stage: "rendering", progress: 0.25, done: 1, total: 4 };
const html = (n: React.ReactNode) => renderToStaticMarkup(<>{n}</>);

describe("Export rendering view", () => {
  const v = renderingView({ job, onClose() {}, dispatch() {} });

  it("has a full-width 4 px progress bar between the status line and the hint", () => {
    const body = html(v.body);
    expect(body).toContain('class="lm-progress lm-progress--block sk-export__bar"');
    expect(body).toContain('aria-valuenow="25"');
    expect(body.indexOf("Rendering sentence 2 of 4")).toBeLessThan(body.indexOf("sk-export__bar"));
    expect(body.indexOf("sk-export__bar")).toBeLessThan(body.indexOf("You can close this window"));
  });
});

describe("Export rendering view with captions and chapters", () => {
  it("lists the files being written: the audio, the caption file and the chapter markers", () => {
    const body = html(renderingView({ job: { ...job, captions: "srt", chapters: true }, onClose() {}, dispatch() {} }).body);
    expect(body).toContain("chapter.mp3");
    expect(body).toContain("chapter.srt (captions)");
    expect(body).toContain("Chapter markers inside the audio");
    expect(html(renderingView({ job, onClose() {}, dispatch() {} }).body)).not.toContain("captions)");
  });

  it("says what was saved when it is done: two files with their counts", () => {
    const done: ExportView = { ...job, stage: "done", path: "C:/x/chapter.mp3", bytes: 2048, captionsPath: "C:/x/chapter.srt", captionCount: 12, chapterCount: 3 };
    const body = html(doneView({ job: done, onClose() {}, dispatch() {} }).body);
    expect(body).toContain("chapter.mp3 with 3 chapters");
    expect(body).toContain("chapter.srt with 12 captions");
  });
});

describe("Export options", () => {
  const view = (text: string, patch: Partial<ReturnType<typeof initExport>["form"]> = {}) => {
    const st = initExport(appState(), { text });
    st.form = { ...st.form, ...patch };
    return html(optionsView({ s: appState(), st, dispatch() {}, onClose() {}, start() {} }).body);
  };

  it("offers captions, off by default, and chapter markers with the number of headings found", () => {
    const body = view("# One\ntext\n# Two\nmore", { format: "mp3" });
    expect(body).toContain('aria-label="Captions"');
    expect(body).toContain("None");
    expect(body).toContain("Add chapter markers");
    expect(body).toContain("2 headings found in the text.");
    expect(body).not.toMatch(/<input[^>]*checked[^>]*>/);
  });

  it("disables chapters for WAV and says why, while captions stay available", () => {
    const body = view("# One\ntext", { format: "wav", chapters: true });
    expect(body).toContain("WAV files cannot hold chapter markers. Captions still work.");
    expect(body).toMatch(/<input[^>]*disabled/);
    expect(body).toContain('aria-label="Captions"');
  });

  it("says when there are no headings", () => {
    expect(view("plain text", { format: "mp3" })).toContain("No headings found.");
    expect(view("# Only", { format: "mp3" })).toContain("1 heading found in the text.");
  });
});
