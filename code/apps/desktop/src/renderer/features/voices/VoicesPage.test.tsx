import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { appState } from "../../app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: { voices: () => new Promise(() => {}) }, speakkitLibrary: {} };
});

import { PreviewCtx } from "../../pages";
import { VoicesPage } from "./VoicesPage";

const page = () =>
  renderToStaticMarkup(
    <PreviewCtx.Provider value={{ playing: null, error: null, toggle: async () => {} } as never}>
      <VoicesPage s={appState()} />
    </PreviewCtx.Provider>,
  );

describe("VoicesPage toolbar", () => {
  it("has the 36 px search field on the left and one filter dropdown on the right, no segmented control", () => {
    const html = page();
    expect(html).toContain('class="lm-field sk-voice-search"');
    expect(html).not.toContain("lm-input--sm");
    expect(html).toContain('class="lm-select sk-voice-filter"');
    expect(html).toContain("Voices: all");
    expect(html).not.toContain("lm-seg");
    expect(html.indexOf("sk-voice-search")).toBeLessThan(html.indexOf("sk-voice-filter"));
  });
});
