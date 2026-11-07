import type { PlayerStatus } from "@speakkit/protocol";
import { describe, expect, it } from "vite-plus/test";
import { isActive, isEnded, transition, type PlayerEvent } from "./transition";

const EVENTS: PlayerEvent[] = ["begin", "pause", "resume-playing", "resume-preparing", "restart", "audio", "finish", "fail", "stop"];

// Every status against every event; "-" means the event is ignored in that status.
const MATRIX: Record<PlayerStatus, string[]> = {
  //             begin        pause    resume-playing resume-preparing restart       audio    finish      fail     stop
  idle: ["preparing", "-", "-", "-", "preparing", "-", "-", "error", "idle"],
  preparing: ["preparing", "paused", "-", "-", "preparing", "playing", "finished", "error", "idle"],
  playing: ["preparing", "paused", "-", "-", "preparing", "-", "finished", "error", "idle"],
  paused: ["preparing", "-", "playing", "preparing", "paused", "-", "-", "error", "idle"],
  finished: ["preparing", "-", "-", "-", "preparing", "-", "-", "error", "idle"],
  error: ["preparing", "-", "-", "-", "preparing", "-", "-", "error", "idle"],
};

describe("transition", () => {
  for (const [status, row] of Object.entries(MATRIX) as [PlayerStatus, string[]][]) {
    it.each(EVENTS.map((event, i) => [event, row[i]!] as const))(`${status} + %s -> %s`, (event, expected) => {
      expect(transition(status, event) ?? "-").toBe(expected);
    });
  }

  it("classifies statuses", () => {
    expect((["idle", "preparing", "playing", "paused", "finished", "error"] as const).filter(isActive)).toEqual(["preparing", "playing", "paused"]);
    expect((["idle", "preparing", "playing", "paused", "finished", "error"] as const).filter(isEnded)).toEqual(["idle", "finished", "error"]);
  });
});
