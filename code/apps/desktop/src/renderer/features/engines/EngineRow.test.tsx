import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { EngineInfo } from "@speakkit/protocol";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { EngineRow } from "./EngineRow";

const chatterbox = (over: Partial<EngineInfo>): EngineInfo => ({ id: "chatterbox", name: "Chatterbox", state: "ready", optional: true, cloning: true, ...over });
const render = (e: EngineInfo, active = true) => renderToStaticMarkup(<EngineRow engine={e} active={active} busy={null} onAction={() => {}} />);

describe("EngineRow", () => {
  it("G10: out of GPU memory says what to do, keeps the raw text behind Details and offers Kokoro and Retry", () => {
    const html = render(chatterbox({ state: "unloaded", reason: "out-of-memory", detail: "OutOfMemoryError: CUDA out of memory" }));
    for (const text of ["Out of GPU memory", "needs about 4 GB of free GPU memory", "Use Kokoro instead", "Retry", "<summary>Details</summary>", "OutOfMemoryError: CUDA out of memory"])
      expect(html).toContain(text);
    expect(html).toContain('data-state="unloaded"');
  });

  it("the raw detail is not shown outside Details, and a normal ready row has no Details", () => {
    expect(render(chatterbox({}))).not.toContain("Details");
  });

  it("an installing row shows the progress bar and Cancel", () => {
    const html = render(chatterbox({ state: "installing", progress: 0.4 }), false);
    expect(html).toContain("Installing 40%");
    expect(html).toContain("Cancel");
  });

  it("G9: a loading Chatterbox says it is warming up", () => {
    expect(render(chatterbox({ state: "loading" }))).toContain("Warming up");
  });

  it("buttons use the default 36 px size, not the 28 px small one", () => {
    expect(render(chatterbox({ state: "missing", reason: "not-installed" }), false)).not.toContain("lm-btn--sm");
  });
});
