import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { appState } from "../../app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { DownloadStep } from "./DownloadStep";

const step = (engine: object) =>
  renderToStaticMarkup(<DownloadStep s={appState({ health: { app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", ...engine } } as never })} onBack={() => {}} onNext={() => {}} />);

describe("DownloadStep model card", () => {
  it("shows the name and the progress line on the left, a bar across the card and no badge", () => {
    const html = step({ state: "downloading", progress: 0.62 });
    expect(html).toContain("kokoro-82m (q8)");
    expect(html).toContain("62% · 110 MB of 177 MB");
    expect(html).toContain('class="lm-progress mdc__bar"');
    expect(html).not.toContain("lm-pill");
  });

  it("says Paused at when the download stopped", () => {
    expect(step({ state: "error", progress: 0.62, detail: "ECONNRESET" })).toContain("Paused at 62% · 110 MB of 177 MB");
  });
});
