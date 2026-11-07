import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { PasteFooter } from "./PasteDialog";

const noop = () => {};

describe("Add pasted text footer", () => {
  it("keeps the actions at the right when there are no voices", () => {
    const html = renderToStaticMarkup(<PasteFooter voices={[]} voice="af_heart" empty={false} onVoice={noop} onClose={noop} onAdd={noop} />);
    expect(html).toContain('class="lib-foot__actions"');
    expect(html).not.toContain('aria-label="Voice"');
  });
});
