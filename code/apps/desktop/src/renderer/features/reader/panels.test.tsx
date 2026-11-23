import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { Voice } from "@speakkit/protocol";
import { VoiceList } from "./Controls";
import { OutlinePanel } from "./Panels";

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
      current={5}
      onPick={noop}
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

  it("says when there are no headings", () => {
    const html = outline({ items: [] });
    expect(html).toContain("This reading has no headings.");
    expect(html).not.toContain("Bookmarks");
  });
});

describe("VoiceList", () => {
  const html = renderToStaticMarkup(<VoiceList voices={voices} voiceId="bf_emma" onVoice={noop} />);
  it("lists the voices with the current one selected and a check at its end", () => {
    expect(html).toMatch(/aria-selected="true"[^>]*><span>Emma<\/span><small>UK · female<\/small><svg/);
    expect(html).toMatch(/aria-selected="false"[^>]*><span>Heart<\/span><small>US · female<\/small><\/button>/);
  });
});
