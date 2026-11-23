import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { PasteFooter } from "./PasteDialog";

const noop = () => {};

describe("Add pasted text footer", () => {
  it("has no voice choice and keeps the actions at the right", () => {
    const html = renderToStaticMarkup(<PasteFooter empty={false} onClose={noop} onAdd={noop} />);
    expect(html).toContain('class="lib-foot__actions"');
    expect(html).not.toContain("Voice");
  });
});
