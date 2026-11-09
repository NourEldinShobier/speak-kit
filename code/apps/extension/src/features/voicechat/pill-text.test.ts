import { describe, expect, it } from "vite-plus/test";
import { announcement, dotLevel, pillText } from "./pill-text";

describe("pillText", () => {
  it("has the line of each notice and none for the grid pill", () => {
    expect(pillText({ phase: "reconnecting", muted: false, attempt: 2 })).toBe("Reconnecting, 2 of 5");
    expect(pillText({ phase: "idle-warning", muted: false, secondsLeft: 17 })).toBe("Still there? 17 s");
    expect(pillText({ phase: "ended", muted: false })).toBe("Conversation ended");
    expect(pillText({ phase: "ended", muted: false, problem: "no-key" }, "no-key")).toBe("Add your API key");
    expect(pillText({ phase: "idle", muted: false })).toBe("");
  });
});

describe("announcement", () => {
  it("names the state the grid shows, and says muted before the phase", () => {
    expect(announcement({ phase: "listening", muted: false }, undefined, true)).toBe("Listening");
    expect(announcement({ phase: "idle", muted: true }, undefined, true)).toBe("Microphone muted");
  });

  it("announces the idle warning once, not every second", () => {
    expect(announcement({ phase: "idle-warning", muted: false, secondsLeft: 29 }, undefined, false)).toBe("Still there?");
    expect(announcement({ phase: "idle-warning", muted: false, secondsLeft: 3 }, undefined, false)).toBe("Still there?");
  });

  it("reads a problem pill as its line", () => {
    expect(announcement({ phase: "ended", muted: false, problem: "offline" }, "offline", false)).toBe("You are offline");
  });
});

describe("dotLevel", () => {
  it("passes the level through, or fixes it with reduced motion", () => {
    expect(dotLevel({ phase: "speaking", muted: false }, false, 0.8)).toBe(0.8);
    expect(dotLevel({ phase: "speaking", muted: false }, true, 0.8)).toBe(0.5);
    expect(dotLevel({ phase: "idle", muted: false }, true, 0.8)).toBe(0);
  });
});
