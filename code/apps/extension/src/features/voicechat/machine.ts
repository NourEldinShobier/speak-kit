import type { VoiceProblem, VoiceView } from "@speakkit/protocol";

export const MAX_RECONNECTS = 5;

export type VoiceEvent =
  | { t: "connected" }
  | { t: "speech-start" }
  | { t: "speech-stop" }
  | { t: "audio-start" }
  | { t: "audio-stop" }
  | { t: "response-done" }
  | { t: "mute"; on: boolean }
  | { t: "lost" }
  | { t: "idle-warning"; secondsLeft: number }
  | { t: "keep-going" }
  | { t: "problem"; problem: VoiceProblem }
  | { t: "end" };

export const initialView = (): VoiceView => ({ phase: "connecting", muted: false });

/** True while the conversation is open and the model can be heard or can hear. */
export const isLive = (v: VoiceView) => v.phase === "idle" || v.phase === "listening" || v.phase === "thinking" || v.phase === "speaking";

/**
 * The session state machine. An interruption is not a state: speech while the model speaks goes straight to listening.
 * A problem or the end closes the conversation for good.
 */
export function reduceVoice(v: VoiceView, e: VoiceEvent): VoiceView {
  if (v.phase === "ended") return v;
  const { muted } = v;
  switch (e.t) {
    case "connected":
      return v.phase === "connecting" || v.phase === "reconnecting" ? { phase: "idle", muted } : v;
    case "speech-start":
      return isLive(v) ? { ...v, phase: "listening" } : v;
    case "speech-stop":
      return v.phase === "listening" ? { ...v, phase: "thinking" } : v;
    case "audio-start":
      return v.phase === "thinking" || v.phase === "idle" || v.phase === "speaking" ? { ...v, phase: "speaking" } : v;
    case "audio-stop":
      return v.phase === "speaking" ? { ...v, phase: "idle" } : v;
    case "response-done":
      return v.phase === "thinking" ? { ...v, phase: "idle" } : v;
    case "mute":
      return { ...v, muted: e.on, phase: e.on && v.phase === "listening" ? "idle" : v.phase };
    case "lost": {
      const attempt = v.phase === "reconnecting" ? (v.attempt ?? 0) + 1 : 1;
      return attempt > MAX_RECONNECTS ? { phase: "ended", muted, problem: "offline" } : { phase: "reconnecting", muted, attempt };
    }
    case "idle-warning":
      return isLive(v) ? { phase: "idle-warning", muted, secondsLeft: e.secondsLeft } : v.phase === "idle-warning" ? { ...v, secondsLeft: e.secondsLeft } : v;
    case "keep-going":
      return v.phase === "idle-warning" ? { phase: "idle", muted } : v;
    case "problem":
      return { phase: "ended", muted, problem: e.problem };
    case "end":
      return { phase: "ended", muted };
  }
}
