import type { CapsuleState, StepState } from "../../../shared/capture/capsule";
import type { Notice } from "../../../shared/capture/notices";
import type { SessionState } from "./index";

export type AfterState = { kind: "saved"; what: string } | { kind: "shot"; what: string } | { kind: "failed"; notice: Notice };

export interface CapsuleInputs {
  session: SessionState;
  /** Name on the target chip. */
  title: string;
  now: number;
  pen: boolean;
  confirmDiscard: boolean;
  micMissing: boolean;
  dictationPaused: boolean;
  switching: boolean;
  /** What stays on screen after the session went idle, until it is closed or fades. */
  after?: AfterState | undefined;
}

const STEPS = ["Saving the video", "Writing the words...", "Copying"] as const;

function stepsFor(step: SessionState["step"]): { label: string; state: StepState }[] {
  const at = { video: 0, words: 1, saving: 2 }[step ?? "video"];
  return STEPS.map((label, i) => {
    if (i === at) return { label, state: "active" };
    return i < at ? { label: i === 0 ? "Video saved" : label, state: "done" } : { label, state: "waiting" };
  });
}

/** What the capsule shows now, or null when nothing should be on screen. Pure: the main process only draws the answer. */
export function capsuleFor(i: CapsuleInputs): CapsuleState | null {
  const { session: s, title: target } = i;
  if (s.phase === "recording")
    return {
      kind: "recording",
      target,
      elapsedMs: Math.max(0, i.now - (s.startedAt ?? i.now)),
      pen: i.pen,
      ...(i.micMissing && { micMissing: true }),
      ...(i.dictationPaused && { dictationPaused: true }),
      ...(i.switching && { switching: true }),
      ...(i.confirmDiscard && { confirmDiscard: true }),
    };
  if (s.phase === "finishing") return { kind: "finishing", target, steps: stepsFor(s.step) };
  if (s.phase === "picking" || !i.after) return null;
  return { ...i.after, target };
}
