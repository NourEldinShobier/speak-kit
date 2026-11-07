import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { Home } from "./HomePage";

describe("Home", () => {
  it("describes the engines as they are: Kokoro by default, Chatterbox optional", () => {
    const html = renderToStaticMarkup(<Home s={appState()} go={() => {}} />);
    expect(html).toContain("Kokoro-82M is the default voice. Chatterbox, an optional second voice for NVIDIA graphics cards, can be added here.");
    expect(html).not.toContain("comes later");
  });
});
