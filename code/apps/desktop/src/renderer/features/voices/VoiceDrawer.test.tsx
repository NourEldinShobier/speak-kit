import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { Voice } from "@speakkit/protocol";
import { VoiceDrawer } from "./VoiceDrawer";

const heart: Voice = { id: "af_heart", name: "Heart", lang: "en-US", gender: "female", quality: "A" };
const noop = () => {};
const render = (over: Partial<Parameters<typeof VoiceDrawer>[0]> = {}) =>
  renderToStaticMarkup(
    <VoiceDrawer voice={heart} tone="blue" position={1} total={28} isDefault={false} playing={false} onPreview={noop} onMakeDefault={noop} onPrev={noop} onNext={noop} onClose={noop} {...over} />,
  );

describe("VoiceDrawer", () => {
  it("is a non-modal dialog named by the voice, with the position, the language, the gender and the grade line", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("aria-modal");
    expect(html).toMatch(/aria-labelledby="([^"]+)"/);
    expect(html).toContain(">1 of 28<");
    expect(html).toContain(">Heart<");
    expect(html).toContain("US English · Female");
    expect(html).toContain("Grade A");
    expect(html).toContain("Best overall rating in the Kokoro project&#x27;s voice grades.");
  });

  it("has previous, next and close buttons, and the first voice cannot go back", () => {
    const html = render();
    expect(html).toContain('aria-label="Previous voice" class="lm-btn lm-btn--icon" disabled=""');
    expect(html).not.toContain('aria-label="Next voice" class="lm-btn lm-btn--icon" disabled=""');
    expect(html).toContain('aria-label="Close"');
  });

  it("disables Next on the last voice", () => {
    expect(render({ position: 28 })).toContain('aria-label="Next voice" class="lm-btn lm-btn--icon" disabled=""');
  });

  it("offers Preview and Make default, then shows Stop and the Default voice state", () => {
    const idle = render();
    expect(idle).toContain('aria-label="Preview Heart"');
    expect(idle).toContain("Make default");
    const on = render({ playing: true, isDefault: true });
    expect(on).toContain('aria-label="Stop Heart"');
    expect(on).toContain("Default voice");
    expect(on).not.toContain("Make default");
    expect(on).toContain(">Default<");
  });
});
