import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { IDLE_READER, type ReaderState } from "../shared/reader";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { MiniPlayer, miniProgress } from "./MiniPlayer";

const reader = (over: Partial<ReaderState>): ReaderState => ({ ...IDLE_READER, title: "Chapter one", total: 4, totalMs: 10_000, elapsedMs: 2_500, ...over });
const mini = (over: Partial<ReaderState>) => renderToStaticMarkup(<MiniPlayer s={appState({ reader: reader(over) })} onTop setOnTop={() => {}} />);

describe("miniProgress", () => {
  it.each([
    ["playing", { value: 25, error: false }],
    ["paused", { value: 25, error: false }],
    ["preparing", { value: undefined, error: false }],
    ["finished", { value: 100, error: false }],
    ["error", { value: 25, error: true }],
  ] as const)("%s", (status, expected) => {
    expect(miniProgress(reader({ status }))).toEqual(expected);
  });

  it("is empty before the length is known", () => {
    expect(miniProgress(reader({ status: "playing", totalMs: 0, elapsedMs: 0 }))).toEqual({ value: 0, error: false });
  });
});

describe("MiniPlayer", () => {
  it("shows a dark 4 px bar with the reading progress while playing", () => {
    const html = mini({ status: "playing" });
    expect(html).toContain('class="lm-progress mini__bar"');
    expect(html).toContain('aria-valuenow="25"');
  });

  it("shows the moving segment while preparing, a full bar when finished and a red bar on error", () => {
    expect(mini({ status: "preparing" })).toContain('class="lm-progress is-indeterminate mini__bar"');
    expect(mini({ status: "finished" })).toContain('aria-valuenow="100"');
    expect(mini({ status: "error" })).toContain('class="lm-progress mini__bar is-error"');
  });

  it("draws the pause button as two 3 px bars while it speaks and a play icon otherwise", () => {
    expect(mini({ status: "playing" })).toContain("lm-icon--player-pause");
    expect(mini({ status: "paused" })).not.toContain("lm-icon--player-pause");
  });

  it("puts the lock and close buttons in the header next to the time left", () => {
    const html = mini({ status: "playing" });
    expect(html.indexOf("mini-left")).toBeLessThan(html.indexOf('aria-label="Stop keeping on top"'));
    expect(html.indexOf('aria-label="Stop keeping on top"')).toBeLessThan(html.indexOf('aria-label="Close"'));
  });
});
