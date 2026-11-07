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
  it("has no drawer until a voice is chosen", () => {
    expect(page()).not.toContain('role="dialog"');
  });
});
