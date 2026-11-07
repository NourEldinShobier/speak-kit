import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { DisplayCard } from "./DisplayPopover";
import { DEFAULT_DISPLAY } from "./display";
import { FindBar } from "./Panels";

const noop = () => {};

describe("find card", () => {
  const html = renderToStaticMarkup(<FindBar query="para" count={3} current={1} onQuery={noop} onStep={noop} onClose={noop} />);
  it("is a floating card with the field, the count, previous, next and close in that order", () => {
    expect(html).toContain('class="rd-float rd-find"');
    const at = ['aria-label="Find in text"', ">2 of 3<", 'aria-label="Previous match"', 'aria-label="Next match"', 'aria-label="Close find"'].map((x) => html.indexOf(x));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe("display card", () => {
  const html = renderToStaticMarkup(<DisplayCard d={DEFAULT_DISPLAY} onChange={noop} onClose={noop} />);
  it("shows the font toggle, three labelled sliders with their values, then the follow switch", () => {
    expect(html).toContain('aria-label="Display"');
    const at = ["Sans", "Serif", "Text size", "<b>19px</b>", "Line spacing", "<b>1.7</b>", "Text width", "<b>680px</b>", "Scroll along with the voice"].map((x) => html.indexOf(x));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
  });
});
