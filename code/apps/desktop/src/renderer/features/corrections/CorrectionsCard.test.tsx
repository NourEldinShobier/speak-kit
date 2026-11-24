import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Correction } from "@speakkit/dictation";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitDictation: {} };
});

import { CorrectionsCard } from "./CorrectionsCard";

const render = (list: Correction[]) => renderToStaticMarkup(<CorrectionsCard list={list} update={() => undefined} />);
const text = (list: Correction[]) =>
  render(list)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("corrections card", () => {
  it("says there are none and offers the form", () => {
    const html = render([]);
    expect(text([])).toContain("No corrections yet.");
    expect(text([])).toContain("0 of 500 fixes");
    expect(html).toContain('aria-label="Heard"');
    expect(html).toContain('aria-label="Should be"');
    expect(html).toContain("Add correction");
  });

  it("lists a fix with its scope and a suggestion with its button to use it", () => {
    const list: Correction[] = [
      { id: "a", heard: "cloud code", correct: "Claude Code", app: "slack", count: 2, createdAt: 1 },
      { id: "b", heard: "get hub", correct: "GitHub", count: 1, createdAt: 2 },
    ];
    const t = text(list);
    expect(t).toContain("cloud code Claude Code Only in slack, seen 2 times Active");
    expect(t).toContain("get hub GitHub Everywhere, seen once");
    const html = render(list);
    expect(html).toContain('aria-label="Use the suggestion get hub"');
    expect(html).not.toContain('aria-label="Use the suggestion cloud code"');
    expect(html).toContain('aria-label="Delete correction cloud code"');
  });
});
