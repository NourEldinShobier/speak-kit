import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ExportView } from "../shared/export";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { ExportPill } from "./ExportDialog";

const job = (over: Partial<ExportView>): ExportView => ({ id: "x1", name: "chapter.mp3", stage: "rendering", progress: 0.25, done: 1, total: 4, ...over });

describe("ExportPill", () => {
  it("shows nothing when no export is running, also when only finished ones exist", () => {
    expect(renderToStaticMarkup(<ExportPill s={appState()} onOpen={() => {}} />)).toBe("");
    expect(renderToStaticMarkup(<ExportPill s={appState({ exports: [job({ stage: "done", progress: 1 })] })} onOpen={() => {}} />)).toBe("");
  });

  it("lists each running export with its name and percentage", () => {
    const html = renderToStaticMarkup(
      <ExportPill s={appState({ exports: [job({}), job({ id: "x2", name: "intro.wav", stage: "encoding", progress: 0.8 }), job({ id: "x3", stage: "done" })] })} onOpen={() => {}} />,
    );
    expect(html).toContain('aria-label="Exporting chapter.mp3, 25%"');
    expect(html).toContain('aria-label="Exporting intro.wav, 80%"');
    expect(html.match(/sk-exportpill__row/g)).toHaveLength(2);
  });
});
