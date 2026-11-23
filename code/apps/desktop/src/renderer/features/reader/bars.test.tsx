import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { PlayerState, Voice } from "@speakkit/protocol";
import type { DocMeta } from "../../../shared/library/contract";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { PlayerBar } from "./PlayerBar";
import { ReaderTop } from "./ReaderParts";

const noop = () => {};
const meta = { id: "d1", title: "T", source: "paste", origin: "Pasted text" } as DocMeta;
const voices = [{ id: "af_heart", name: "Heart", lang: "en-US", gender: "female" }] as Voice[];

const top = () => renderToStaticMarkup(<ReaderTop meta={meta} panel={null} displayOpen={false} blocked={false} dispatch={noop} onBack={noop} onExport={noop} />);
const bar = () =>
  renderToStaticMarkup(
    <PlayerBar
      state={{ status: "paused", elapsedMs: 5000, totalMs: 60000 } as unknown as PlayerState}
      estimatedTotalMs={60000}
      speed={1.5}
      voices={voices}
      voiceId="af_heart"
      sleepLeftMs={0}
      disabled={false}
      volume={0.8}
      onToggle={noop}
      onSkip={noop}
      onBlock={noop}
      onSeek={noop}
      onSpeed={noop}
      onVoice={noop}
      onSleep={noop}
      onVolume={noop}
    />,
  );
const names = (html: string) => [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

describe("reader header", () => {
  it("has a fixed set of reading buttons and no toolbar customisation", () => {
    expect(names(top())).toEqual(["Back to library", "Find in text", "Display settings", "Export audio", "Outline"]);
  });
});

describe("reader footer", () => {
  it("shows the voice name on the voice button and no title block", () => {
    expect(bar()).toContain("<span>Heart</span></button>");
    expect(bar()).not.toContain("rd-bar__title");
  });
  it("has the transport and a fixed set of controls: speed, voice, sleep timer and volume", () => {
    expect(names(bar())).toEqual(["Previous paragraph", "Back 10 seconds", "Play", "Forward 10 seconds", "Next paragraph", "Speed 1.5x", "Voice: Heart", "Sleep timer", "Volume"]);
  });
});
