import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { parseConfig } from "../../../shared/schemas";
import { appState } from "../../app-state.fixture";
import { BrowserPage } from "./BrowserPage";

describe("server port field", () => {
  it("shows a short range hint for a port the registry refuses", () => {
    const html = renderToStaticMarkup(<BrowserPage s={appState({ config: parseConfig({ preferredPort: 80 }) })} />);
    expect(html).toContain("1024 to 65535");
    expect(html).not.toContain("Invalid");
  });

  it("shows no hint for a valid port", () => {
    expect(renderToStaticMarkup(<BrowserPage s={appState({ config: parseConfig({ preferredPort: 50000 }) })} />)).not.toContain("1024 to 65535");
  });
});
