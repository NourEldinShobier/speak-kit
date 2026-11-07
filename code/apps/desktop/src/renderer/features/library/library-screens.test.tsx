import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Voice } from "@speakkit/protocol";
import type { DocMeta } from "../../../shared/library/contract";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { LibraryBody } from "./LibraryBody";
import { PasteFooter } from "./PasteDialog";
import { initLibraryUi, libraryView } from "./page-model";

const NOW = Date.UTC(2026, 5, 15, 12);
const doc: DocMeta = { id: "d1", title: "Notes", source: "paste", format: "text", origin: "Pasted", addedAt: NOW, wordCount: 100, progress: { sentence: 0, fraction: 0 }, finished: false };
const voices: Voice[] = [{ id: "af_heart", name: "Heart", lang: "en-US", gender: "female", quality: "A", traits: "warm" }];
const noop = () => {};

describe("Library sort dropdown", () => {
  it("is the 36 px select, not the small one", () => {
    const view = libraryView([doc], { query: "", filter: "all", sort: "played", hits: null, speed: 1 });
    const html = renderToStaticMarkup(<LibraryBody loaded ui={initLibraryUi()} view={view} hits={null} speed={1} now={NOW} dispatch={noop} pickFiles={noop} open={noop} refresh={async () => {}} />);
    expect(html).toContain('class="lm-select"');
    expect(html).not.toContain("lm-select--sm");
  });
});

describe("Add pasted text footer", () => {
  const footer = (list: Voice[]) => renderToStaticMarkup(<PasteFooter voices={list} voice="af_heart" empty={false} onVoice={noop} onClose={noop} onAdd={noop} />);

  it("has the 36 px voice dropdown at the left and Cancel, Add, Add and play grouped at the right", () => {
    const html = footer(voices);
    expect(html).toContain('class="lib-foot"');
    expect(html).not.toContain("lm-select--sm");
    expect(html.indexOf('aria-label="Voice"')).toBeLessThan(html.indexOf('class="lib-foot__actions"'));
    const group = html.slice(html.indexOf('class="lib-foot__actions"'));
    expect([...group.matchAll(/<button[^>]*>(?:<svg.*?<\/svg>)?([^<]+)<\/button>/g)].map((m) => m[1])).toEqual(["Cancel", "Add", "Add and play"]);
  });

  it("keeps the actions at the right when there are no voices", () => {
    const html = footer([]);
    expect(html).toContain('class="lib-foot__actions"');
    expect(html).not.toContain('aria-label="Voice"');
  });
});
