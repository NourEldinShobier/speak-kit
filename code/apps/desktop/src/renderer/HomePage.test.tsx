import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { Home } from "./HomePage";

describe("Home", () => {
  it("describes the engine as it is: Kokoro", () => {
    const html = renderToStaticMarkup(<Home s={appState()} go={() => {}} />);
    expect(html).toContain("Kokoro-82M is the voice engine. Manage its download and memory here.");
    expect(html).not.toContain("comes later");
  });
});
