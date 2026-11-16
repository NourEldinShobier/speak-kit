import { describe, expect, it } from "vite-plus/test";
import type { HudView } from "../../shared/dictation/contract";
import { drawn, hudPosition } from "./hud-place";

const area = { x: 1920, y: 0, width: 2560, height: 1400 };
const size = { width: 560, height: 64 };

describe("hudPosition", () => {
  it("centres the pill 24 px above the bottom of the display", () => {
    expect(hudPosition(area, size, "bottom")).toEqual({ x: 2920, y: 1312 });
  });
  it("centres the pill 24 px below the top of the display", () => {
    expect(hudPosition(area, size, "top")).toEqual({ x: 2920, y: 24 });
  });
  it("follows a work area that starts below a taskbar at the top", () => {
    expect(hudPosition({ x: 0, y: 40, width: 1000, height: 700 }, size, "top")).toEqual({ x: 220, y: 64 });
  });
  it("rounds to whole pixels on an odd width", () => {
    expect(hudPosition({ x: 0, y: 0, width: 1001, height: 700 }, size, "bottom").x).toBe(221);
  });
});

describe("drawn", () => {
  const views: HudView[] = [
    { kind: "ready", hotkey: "x" },
    { kind: "recording", locked: false, startedAt: 0, level: 0, hotkey: "x" },
    { kind: "transcribing" },
    { kind: "pasted" },
    { kind: "copied", reason: "clipboard" },
    { kind: "notice", text: "t" },
    { kind: "error", text: "e", icon: "alert-triangle" },
  ];
  it("draws everything while the indicator is top or bottom", () => {
    expect(views.every((v) => drawn("top", v) && drawn("bottom", v))).toBe(true);
  });
  it("hides the recording indicator when it is off, and keeps what needs reading", () => {
    expect(views.filter((v) => drawn("off", v)).map((v) => v.kind)).toEqual(["copied", "notice", "error"]);
  });
});
