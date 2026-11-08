import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { EngineInfo } from "@speakkit/protocol";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { EngineRow } from "./EngineRow";

const kokoro = (over: Partial<EngineInfo>): EngineInfo => ({ id: "kokoro", name: "Kokoro-82M", state: "ready", ...over });
const render = (e: EngineInfo) => renderToStaticMarkup(<EngineRow engine={e} busy={null} onAction={() => {}} />);

describe("EngineRow", () => {
  it("a ready row has a name, the blurb and no buttons", () => {
    const html = render(kokoro({}));
    expect(html).toContain("Kokoro-82M");
    expect(html).toContain("Natural English voices");
    expect(html).not.toContain("<button");
  });

  it("an unloaded row offers Load now", () => {
    const html = render(kokoro({ state: "unloaded" }));
    expect(html).toContain('data-state="unloaded"');
    expect(html).toContain("Load now");
  });

  it("a downloading row shows the percent and a progress bar", () => {
    const html = render(kokoro({ state: "downloading", progress: 0.4 }));
    expect(html).toContain("Download 40%");
    expect(html).toContain("Kokoro-82M progress");
  });
});
