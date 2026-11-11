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
  "cost-warning": "Cost limit reached",
  ended: "Conversation ended",
};

/** The usage line of an ended conversation, e.g. "about $0.12 - 4 min"; empty when nothing was billed or a problem ended it. */
export function usageLine(v: VoiceView): string {
  const u = v.usage;
  if (!u || v.problem) return "";
  const cost = u.costUsd < 0.005 ? "under $0.01" : `about $${u.costUsd.toFixed(2)}`;
  const s = u.seconds;
  return s === undefined ? cost : `${cost} \u00b7 ${s < 60 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`}`;
}

/** The line of a notice pill; empty for the grid pill. */
export function pillText(v: VoiceView, problem?: VoiceProblem): string {
  if (problem) return PROBLEMS[problem].text;
  const lines: Partial<Record<VoiceView["phase"], string>> = {
    reconnecting: `Reconnecting, ${v.attempt ?? 1} of 5`,
    "idle-warning": `Still there? ${v.secondsLeft ?? 30} s`,
    "cost-warning": "Cost limit reached. Ending soon",
    ended: v.usage?.capped ? "Cost limit reached. Conversation ended" : "Conversation ended",
  };
  return lines[v.phase] ?? "";
}

/** What a screen reader hears when the state changes: not every second of the idle countdown. */
export function announcement(v: VoiceView, problem: VoiceProblem | undefined, grid: boolean): string {
  if (problem || (!grid && v.phase !== "idle-warning")) return [pillText(v, problem), v.phase === "ended" ? usageLine(v) : ""].filter(Boolean).join(". ");
  if (v.phase === "idle-warning") return SPOKEN["idle-warning"];
  return v.muted ? "Microphone muted" : SPOKEN[v.phase];
}

/** The level that drives the dots: with reduced motion a fixed one, so the pattern stands still. */
export function dotLevel(v: VoiceView, still: boolean, level: number): number {
  if (!still) return level;
  return v.phase === "listening" || v.phase === "speaking" ? 0.5 : 0;
}
