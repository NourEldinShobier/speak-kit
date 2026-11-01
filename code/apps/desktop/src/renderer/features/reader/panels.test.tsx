import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { Voice } from "@speakkit/protocol";
import { OutlinePanel, VoicePanel } from "./Panels";

const noop = () => {};
const voices = [
  { id: "af_heart", name: "Heart", lang: "en-US", gender: "female" },
  { id: "bf_emma", name: "Emma", lang: "en-GB", gender: "female" },
] as Voice[];
const outline = (over: Partial<Parameters<typeof OutlinePanel>[0]> = {}) =>
  renderToStaticMarkup(
    <OutlinePanel
      items={[
        { label: "Intro", block: 0, level: 1 },
        { label: "Part two", block: 4, level: 2 },
      ]}
      bookmarks={[]}
      current={5}
      onPick={noop}
      onPickBookmark={noop}
      onRemoveBookmark={noop}
      onClose={noop}
      {...over}
    />,
  );

describe("OutlinePanel", () => {
  it("lists headings and marks the one the reading is in", () => {
    const html = outline();
    expect(html).toContain("Intro");
    expect(html).toMatch(/aria-current="true"[^>]*>Part two/);
    expect(html).not.toMatch(/aria-current="true"[^>]*>Intro/);
  });

  it("says when there are no headings and no bookmarks", () => {
    const html = outline({ items: [] });
    expect(html).toContain("This reading has no headings.");
    expect(html).toContain("No bookmarks yet.");
  });

  it("lists bookmarks with a remove button each", () => {
    const html = outline({ bookmarks: [{ sentence: 2, label: "The second place." }] });
    expect(html).toContain('aria-label="Bookmarks"');
    expect(html).toContain("The second place.");
    expect(html).toContain('aria-label="Remove bookmark: The second place."');
    expect(html).not.toContain("No bookmarks yet.");
  });
});

describe("VoicePanel", () => {
  const html = renderToStaticMarkup(<VoicePanel voices={voices} voiceId="bf_emma" speed={1.5} onVoice={noop} onSpeed={noop} onClose={noop} />);
  it("shows the speed, the presets and the voices with the current one selected", () => {
    expect(html).toContain('aria-label="Voice panel"');
    expect(html).toContain("1.5x");
    for (const p of ["0.8x", "1x", "1.2x", "2x", "3x"]) expect(html).toContain(`>${p}</button>`);
    expect(html).toMatch(/aria-selected="true"[^>]*><span>Emma<\/span><small>UK · female/);
    expect(html).toMatch(/aria-selected="false"[^>]*><span>Heart<\/span><small>US · female/);
  });
});
