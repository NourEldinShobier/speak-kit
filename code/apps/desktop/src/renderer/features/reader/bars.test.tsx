import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { PlayerState, Voice } from "@speakkit/protocol";
import type { DocMeta } from "../../../shared/library/contract";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { PlayerBar } from "./PlayerBar";
import { ReaderTop } from "./ReaderParts";
import type { FooterId, HeaderId } from "./toolbar";

const noop = () => {};
const meta = { id: "d1", title: "T", source: "paste", origin: "Pasted text" } as DocMeta;
const voices = [{ id: "af_heart", name: "Heart", lang: "en-US", gender: "female" }] as Voice[];

const top = (hidden: HeaderId[] = []) =>
  renderToStaticMarkup(
    <ReaderTop meta={meta} panel={null} displayOpen={false} bookmarked={false} blocked={false} hidden={hidden} dispatch={noop} onBack={noop} onBookmark={noop} onExport={noop} onShown={noop} />,
  );
const bar = (hidden: FooterId[] = []) =>
  renderToStaticMarkup(
    <PlayerBar
      state={{ status: "paused", elapsedMs: 5000, totalMs: 60000 } as unknown as PlayerState}
      estimatedTotalMs={60000}
      speed={1.5}
      voices={voices}
      voiceId="af_heart"
      sleepLeftMs={0}
      disabled={false}
      panel={null}
      volume={0.8}
      hidden={hidden}
      onToggle={noop}
      onSkip={noop}
      onBlock={noop}
      onSeek={noop}
      onSpeed={noop}
      onVoice={noop}
      onSleep={noop}
      onOutline={noop}
      onVolume={noop}
      onShown={noop}
    />,
  );
const names = (html: string) => [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

describe("reader header", () => {
  it("draws find, display, bookmark, export and outline, then the customise button, and no voice button", () => {
    expect(names(top())).toEqual(["Back to library", "Find in text", "Display settings", "Bookmark this place", "Export audio", "Outline", "Customise header toolbar"]);
  });
  it("leaves out the items the person turned off", () => {
    expect(names(top(["display", "export"]))).toEqual(["Back to library", "Find in text", "Bookmark this place", "Outline", "Customise header toolbar"]);
  });
});

describe("reader footer", () => {
  it("draws the transport, the position slider, then speed, voice, sleep timer, volume, queue and the customise button", () => {
    const html = bar();
    expect(names(html)).toEqual([
      "Previous paragraph",
      "Back 10 seconds",
      "Play",
      "Forward 10 seconds",
      "Next paragraph",
      "Voice: Heart",
      "Sleep timer",
      "Volume",
      "Queue",
      "Customise player toolbar",
    ]);
    expect(html).toContain(">1.5x</button>");
    expect(html.indexOf("Next paragraph")).toBeLessThan(html.indexOf('data-testid="elapsed"'));
    expect(html.indexOf('data-testid="elapsed"')).toBeLessThan(html.indexOf('aria-label="Position"'));
    expect(html.indexOf('aria-label="Position"')).toBeLessThan(html.indexOf('data-testid="total"'));
    expect(html.indexOf('data-testid="total"')).toBeLessThan(html.indexOf(">1.5x</button>"));
  });
  it("shows the voice name on the voice button and no title block", () => {
    expect(bar()).toContain("<span>Heart</span></button>");
    expect(bar()).not.toContain("rd-bar__title");
  });
  it("leaves out the items the person turned off, never the transport", () => {
    const n = names(bar(["speed", "volume", "queue"]));
    expect(n).toEqual(["Previous paragraph", "Back 10 seconds", "Play", "Forward 10 seconds", "Next paragraph", "Voice: Heart", "Sleep timer", "Customise player toolbar"]);
  });
});
