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

describe("VoicesPage", () => {
  it("has a search box and no filter dropdown or detail dialog", () => {
    const html = page();
    expect(html).toContain('aria-label="Search voices"');
    expect(html).not.toContain("Filter voices");
    expect(html).not.toContain('role="dialog"');
  });
});
