import { describe, expect, test } from "vite-plus/test";
import type { UiModel } from "../../shared/ui-types";
import { dockText, dockVisible, fmtLong, idleSubtitle, TOGGLE } from "./dock-model";

const model = (over: Partial<UiModel> = {}): UiModel => ({
  status: "idle",
  elapsedMs: 0,
  totalMs: 0,
  speed: 1.2,
  voice: "af_heart",
  voiceName: "Heart",
  estimate: () => 90_000,
  dark: false,
  engineAsleep: false,
  showDock: true,
  alwaysDock: false,
  launcher: null,
  showBubble: true,
  showGutter: true,
  readerOpen: false,
  ...over,
});

const launcher: UiModel["launcher"] = { enabled: true, side: "right", idle: "peek", openOn: "hover", closeDelayMs: 300, widerWhileReading: true, y: 0.42 };

describe("dockVisible", () => {
  test.each([
    ["idle without a rule stays hidden", { status: "idle" }, null, false],
    ["idle with the always-dock rule shows", { status: "idle", alwaysDock: true }, null, true],
    ["playing with no launcher shows", { status: "playing" }, null, true],
    ["playing with a launcher hides", { status: "playing", launcher }, null, false],
    ["finished with a launcher shows", { status: "finished", launcher }, null, true],
    ["dock turned off hides playing", { status: "playing", showDock: false }, null, false],
    ["dismissed in this status hides", { status: "playing" }, "playing", false],
    ["dismissed in another status shows", { status: "paused" }, "playing", true],
    ["error shows", { status: "error" }, null, true],
    ["error dismissed hides", { status: "error" }, "error", false],
    ["error shows after a dismissal in another status", { status: "error" }, "playing", true],
  ] as const)("%s", (...row) => {
    const [, over, dismissed, want] = row;
    expect(dockVisible(model(over as Partial<UiModel>), dismissed)).toBe(want);
  });
});

describe("dockText", () => {
  test.each([
    ["preparing", { status: "preparing" }, false, "Preparing voice..."],
    ["preparing for over 1.2 s", { status: "preparing" }, true, "Waking the voice engine..."],
    ["finished", { status: "finished" }, false, "Done · Read again"],
    ["with a paragraph", { status: "playing", paragraph: { n: 3, of: 12 }, totalMs: 600_000, elapsedMs: 60_000 }, false, "Paragraph 3 of 12 · 9 min left"],
    ["paused without a paragraph", { status: "paused", elapsedMs: 75_000 }, false, "Paused · 1:15"],
    ["playing without a paragraph", { status: "playing", elapsedMs: 5_000 }, false, "Reading · 0:05"],
  ] as const)("%s", (...row) => {
    const [, over, waking, want] = row;
    expect(dockText(model(over as Partial<UiModel>), waking)).toBe(want);
  });
});

test("idleSubtitle says the engine is asleep, else the reading time at the speed, else nothing", () => {
  expect(idleSubtitle(model({ engineAsleep: true }))).toBe("Engine asleep · wakes on play");
  expect(idleSubtitle(model())).toBe("1 min 30 s at 1.2x");
  expect(idleSubtitle(model({ estimate: () => 0 }))).toBe("");
});

test("fmtLong switches to minutes at 60 s", () => {
  expect([fmtLong(59_400), fmtLong(60_000), fmtLong(125_000)]).toEqual(["59 s", "1 min 0 s", "2 min 5 s"]);
});

test("every reading status has its own toggle label and icon", () => {
  expect(TOGGLE).toEqual({
    preparing: { label: "Preparing", icon: "loader-2" },
    playing: { label: "Pause", icon: "player-pause" },
    paused: { label: "Play", icon: "player-play" },
    finished: { label: "Replay", icon: "refresh" },
  });
});
