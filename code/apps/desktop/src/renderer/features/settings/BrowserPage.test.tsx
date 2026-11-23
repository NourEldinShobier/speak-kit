import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { appState } from "../../app-state.fixture";
import { BrowserPage } from "./BrowserPage";

describe("Browser integration page", () => {
  const html = renderToStaticMarkup(<BrowserPage s={appState({ token: "t".repeat(64) })} />);

  it("pairs with one Copy button and shows no token text", () => {
    expect(html).toContain("Pairing token");
    expect(html).toContain("Copy it here, then paste it in the extension options under General.");
    expect(html).toContain(">Copy<");
    expect(html).not.toContain("t".repeat(64));
    for (const gone of ["Reveal", "Hide", "Regenerate"]) expect(html).not.toContain(gone);
  });

  it("has no port field or port warning", () => {
    for (const gone of ["Server port", "Apply", "1024 to 65535", "is busy"]) expect(html).not.toContain(gone);
  });
});
