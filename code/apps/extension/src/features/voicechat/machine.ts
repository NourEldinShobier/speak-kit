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

type Handler<T extends VoiceEvent["t"]> = (v: VoiceView, e: Extract<VoiceEvent, { t: T }>) => VoiceView;
const phaseIf = (v: VoiceView, from: VoiceView["phase"][], to: VoiceView["phase"]): VoiceView => (from.includes(v.phase) ? { ...v, phase: to } : v);

const HANDLERS: { [T in VoiceEvent["t"]]: Handler<T> } = {
  connected: (v) => (v.phase === "connecting" || v.phase === "reconnecting" ? { phase: "idle", muted: v.muted } : v),
  "speech-start": (v) => (isLive(v) ? { ...v, phase: "listening" } : v),
  "speech-stop": (v) => phaseIf(v, ["listening"], "thinking"),
  "audio-start": (v) => phaseIf(v, ["thinking", "idle", "speaking"], "speaking"),
  "audio-stop": (v) => phaseIf(v, ["speaking"], "idle"),
  "response-done": (v) => phaseIf(v, ["thinking"], "idle"),
  mute: (v, e) => ({ ...v, muted: e.on, phase: e.on && v.phase === "listening" ? "idle" : v.phase }),
  lost: (v) => {
    const attempt = v.phase === "reconnecting" ? (v.attempt ?? 0) + 1 : 1;
    return attempt > MAX_RECONNECTS ? { phase: "ended", muted: v.muted, problem: "offline" } : { phase: "reconnecting", muted: v.muted, attempt };
  },
  "idle-warning": (v, e) => {
    if (isLive(v)) return { phase: "idle-warning", muted: v.muted, secondsLeft: e.secondsLeft };
    return v.phase === "idle-warning" ? { ...v, secondsLeft: e.secondsLeft } : v;
  },
  "keep-going": (v) => (v.phase === "idle-warning" ? { phase: "idle", muted: v.muted } : v),
  problem: (v, e) => ({ phase: "ended", muted: v.muted, problem: e.problem }),
  end: (v) => ({ phase: "ended", muted: v.muted }),
};

/**
 * The session state machine. An interruption is not a state: speech while the model speaks goes straight to listening.
 * A problem or the end closes the conversation for good.
 */
export function reduceVoice(v: VoiceView, e: VoiceEvent): VoiceView {
  if (v.phase === "ended") return v;
  return (HANDLERS[e.t] as Handler<typeof e.t>)(v, e);
}
