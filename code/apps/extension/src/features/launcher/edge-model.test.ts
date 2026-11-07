import { describe, expect, test } from "vite-plus/test";
import type { UiModel } from "../../shared/ui-types";
import { PLAY_VIEW, pillTop, railPillTop, railTop, sideClass, tabClass, tabTop, tooltipText } from "./edge-model";

const launcher = { enabled: true, side: "right", idle: "peek", openOn: "hover", closeDelayMs: 300, widerWhileReading: true, y: 0.42 } as const;
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
  launcher,
  showBubble: true,
  showGutter: true,
  readerOpen: false,
  dismissed: false,
  ...over,
});

test("the play button invites a reading unless one is running, and spins while preparing", () => {
  expect(PLAY_VIEW).toEqual({
    idle: { label: "Listen to this page", icon: "player-play" },
    finished: { label: "Listen to this page", icon: "player-play" },
    error: { label: "Listen to this page", icon: "player-play" },
    preparing: { label: "Resume", icon: "loader-2" },
    playing: { label: "Pause", icon: "player-pause" },
    paused: { label: "Resume", icon: "player-play" },
  });
});

describe("tab and pill placement", () => {
  test("the tab sits at its saved height and stays 8 px inside the viewport", () => {
    expect(tabTop(0.5, 800)).toBe(400);
    expect(tabTop(0, 800)).toBe(8);
    expect(tabTop(1, 800)).toBe(716);
  });

  test("the pill lines its play button up with the tab and stays inside the viewport", () => {
    expect(pillTop(400, 800, 300)).toBe(400 + 38 - 108);
    expect(pillTop(10, 800, 300)).toBe(8);
    expect(pillTop(716, 800, 300)).toBe(492);
  });

  test("the reading rail is 96 px high and centred on the viewport height, 8 px inside a short one", () => {
    expect(railTop(800)).toBe(352);
    expect(railTop(720)).toBe(312);
    expect(railTop(100)).toBe(8);
  });

  test("the pill lines its play button up with the middle of the rail", () => {
    expect(railPillTop(352, 800, 300)).toBe(352 + 48 - 108);
  });
});

test("tab classes follow the side, the reading width and the idle ghost", () => {
  expect(sideClass(launcher)).toBe("");
  expect(sideClass({ ...launcher, side: "left" })).toBe(" sk-left");
  expect(tabClass(launcher, true)).toBe("sk-tab is-reading");
  expect(tabClass({ ...launcher, side: "left", idle: "hidden" }, false)).toBe("sk-tab sk-left is-ghost");
  expect(tabClass({ ...launcher, widerWhileReading: false }, true)).toBe("sk-tab");
});

describe("tooltipText", () => {
  test("while reading it names the toggle and the Space key", () => {
    expect(tooltipText(model({ status: "playing" }), true)).toEqual({ label: "Pause", hint: "Space" });
    expect(tooltipText(model({ status: "paused" }), true)).toEqual({ label: "Resume", hint: "Space" });
  });
  test("when idle it shows the reading time, or that the engine wakes on play", () => {
    expect(tooltipText(model(), false)).toEqual({ label: "Listen to this page", hint: "1:30" });
    expect(tooltipText(model({ engineAsleep: true }), false)).toEqual({ label: "Listen to this page", hint: "Wakes on play" });
    expect(tooltipText(model({ estimate: () => 0 }), false)).toEqual({ label: "Listen to this page", hint: "" });
  });
});
