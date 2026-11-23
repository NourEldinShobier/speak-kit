import { describe, expect, it } from "vite-plus/test";
import { announcement, dotLevel, pillText, usageLine } from "./pill-text";

describe("pillText", () => {
  it("has the line of each notice and none for the grid pill", () => {
    expect(pillText({ phase: "reconnecting", muted: false, attempt: 2 })).toBe("Reconnecting, 2 of 5");
    expect(pillText({ phase: "idle-warning", muted: false, secondsLeft: 17 })).toBe("Still there? 17 s");
    expect(pillText({ phase: "ended", muted: false })).toBe("Conversation ended");
    expect(pillText({ phase: "ended", muted: false, problem: "no-key" }, "no-key")).toBe("Add your API key");
    expect(pillText({ phase: "idle", muted: false })).toBe("");
  });
});

describe("usage line", () => {
  const ended = (usage: { costUsd: number; seconds?: number; capped?: boolean }) => ({ phase: "ended" as const, muted: false, usage });
  it("shows the estimated cost and the length of the conversation", () => {
    expect(usageLine(ended({ costUsd: 0.1234, seconds: 250 }))).toBe("about $0.12 · 4 min");
    expect(usageLine(ended({ costUsd: 0.2, seconds: 42 }))).toBe("about $0.20 · 42 s");
    expect(usageLine(ended({ costUsd: 0.004, seconds: 90 }))).toBe("under $0.01 · 2 min");
    expect(usageLine(ended({ costUsd: 0.31 }))).toBe("about $0.31");
  });
  it("is empty without a billed response and when a problem ended the conversation", () => {
    expect(usageLine({ phase: "ended", muted: false })).toBe("");
    expect(usageLine({ ...ended({ costUsd: 1 }), problem: "offline" })).toBe("");
  });
  it("says when the cost cap ended the conversation, and warns before", () => {
    expect(pillText(ended({ costUsd: 0.5, capped: true }))).toBe("Cost limit reached. Conversation ended");
    expect(pillText({ phase: "cost-warning", muted: false })).toBe("Cost limit reached. Ending soon");
    expect(announcement(ended({ costUsd: 0.12, seconds: 250 }), undefined, false)).toBe("Conversation ended. about $0.12 · 4 min");
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
