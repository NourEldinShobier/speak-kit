import { describe, expect, it } from "vite-plus/test";
import type { HudView } from "../../shared/dictation/contract";
import { drawn, hudPosition, mouseMode } from "./hud-place";

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
  it("places the pill on a display left of and above the primary one, where coordinates are negative", () => {
    const left = { x: -1707, y: -120, width: 1707, height: 960 };
    expect(hudPosition(left, size, "bottom")).toEqual({ x: -1133, y: 752 });
    expect(hudPosition(left, size, "top")).toEqual({ x: -1133, y: -96 });
  });
  it("places the pill on the primary display at scale 1 and on a scaled one next to it, each by its own work area", () => {
    const primary = { x: 0, y: 0, width: 1920, height: 1040 };
    const scaled = { x: 1920, y: 0, width: 1280, height: 672 };
    expect(hudPosition(primary, size, "bottom")).toEqual({ x: 680, y: 952 });
    expect(hudPosition(scaled, size, "bottom")).toEqual({ x: 2280, y: 584 });
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
  it("keeps the skip button of the rewrite even when the indicator is off, because the cancel key is taken then", () => {
    expect(drawn("off", { kind: "transcribing", skip: { label: "Skip", id: "skip-rewrite" } })).toBe(true);
  });
});

describe("mouseMode", () => {
  it("takes the whole window for a failure with a button and the skip button of the rewrite", () => {
    const skip = { label: "Skip", id: "skip-rewrite" } as const;
    expect(mouseMode({ kind: "transcribing", skip })).toBe("click");
    expect(mouseMode({ kind: "error", text: "e", icon: "alert-triangle", action: { label: "Try again", id: "retry" } })).toBe("click");
  });
  it("forwards the mouse for a recording, whose cancel button reports its hover", () => {
    expect(mouseMode({ kind: "recording", locked: false, startedAt: 0, level: 0, hotkey: "x" })).toBe("forward");
  });
  it("lets the mouse through everywhere else", () => {
    expect([{ kind: "transcribing" }, { kind: "error", text: "e", icon: "alert-triangle" }, { kind: "pasted" }].map((v) => mouseMode(v as HudView))).toEqual(["ignore", "ignore", "ignore"]);
  });
});
