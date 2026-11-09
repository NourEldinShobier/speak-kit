import type { VoiceProblem, VoiceView } from "@speakkit/protocol";
import { PROBLEMS } from "./errors";

const SPOKEN: Record<VoiceView["phase"], string> = {
  connecting: "Connecting",
  idle: "Ready. Say something.",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  reconnecting: "Reconnecting",
  "idle-warning": "Still there?",
  ended: "Conversation ended",
};

/** The line of a notice pill; empty for the grid pill. */
export function pillText(v: VoiceView, problem?: VoiceProblem): string {
  if (problem) return PROBLEMS[problem].text;
  const lines: Partial<Record<VoiceView["phase"], string>> = {
    reconnecting: `Reconnecting, ${v.attempt ?? 1} of 5`,
    "idle-warning": `Still there? ${v.secondsLeft ?? 30} s`,
    ended: "Conversation ended",
  };
  return lines[v.phase] ?? "";
}

/** What a screen reader hears when the state changes: not every second of the idle countdown. */
export function announcement(v: VoiceView, problem: VoiceProblem | undefined, grid: boolean): string {
  if (problem || (!grid && v.phase !== "idle-warning")) return pillText(v, problem);
  if (v.phase === "idle-warning") return SPOKEN["idle-warning"];
  return v.muted ? "Microphone muted" : SPOKEN[v.phase];
}

/** The level that drives the dots: with reduced motion a fixed one, so the pattern stands still. */
export function dotLevel(v: VoiceView, still: boolean, level: number): number {
  if (!still) return level;
  return v.phase === "listening" || v.phase === "speaking" ? 0.5 : 0;
}
