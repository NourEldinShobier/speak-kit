import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: { engines: () => new Promise(() => {}) }, speakkitLibrary: {} };
});

import { EngineStep } from "./EngineStep";

const render = (choice: "kokoro" | "chatterbox") => renderToStaticMarkup(<EngineStep choice={choice} onChoose={() => {}} onBack={() => {}} onDownload={() => {}} />);

describe("EngineStep", () => {
  it("keeps Kokoro selected and Chatterbox disabled while the computer is checked", () => {
    const html = render("kokoro");
    expect(html).toContain("Checking this computer.");
    expect(html).not.toContain("Not available yet");
    expect(html).not.toContain("chatterbox-plan");
  });

  it("says Chatterbox installs after setup when it is the choice", () => {
    const html = render("chatterbox");
    expect(html).toContain("Kokoro downloads now and stays as your fallback.");
    expect(html).toContain("Chatterbox installs in the background once setup is finished");
  });
});
