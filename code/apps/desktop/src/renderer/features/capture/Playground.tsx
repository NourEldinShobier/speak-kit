import type { CapsuleState } from "../../../shared/capture/capsule";
import { noticeFor } from "../../../shared/capture/notices";
import { CapsulePill } from "./CapsulePill";

const TARGET = "Figma · Pricing page";

export const STORIES: { name: string; state: CapsuleState }[] = [
  { name: "Recording", state: { kind: "recording", target: TARGET, elapsedMs: 65_000, pen: false } },
  { name: "Pen on", state: { kind: "recording", target: TARGET, elapsedMs: 65_000, pen: true } },
  { name: "Discard asks", state: { kind: "recording", target: TARGET, elapsedMs: 65_000, pen: false, confirmDiscard: true } },
  { name: "Switch target", state: { kind: "recording", target: TARGET, elapsedMs: 65_000, pen: false, switching: true } },
  { name: "Dictation paused", state: { kind: "recording", target: TARGET, elapsedMs: 5000, pen: false, dictationPaused: true } },
  { name: "No microphone", state: { kind: "recording", target: TARGET, elapsedMs: 5000, pen: false, micMissing: true } },
  {
    name: "Finishing",
    state: {
      kind: "finishing",
      target: TARGET,
      steps: [
        { label: "Video saved", state: "done" },
        { label: "Writing the words...", state: "active" },
        { label: "Copying", state: "waiting" },
      ],
    },
  },
  { name: "Saved and copied", state: { kind: "saved", target: TARGET, what: "Copied picture and text" } },
  { name: "Screenshot card", state: { kind: "shot", target: "Screenshot · Chrome window", what: "Copied picture" } },
  { name: "Send countdown", state: { kind: "countdown", target: TARGET, secondsLeft: 3 } },
  { name: "Held", state: { kind: "countdown", target: TARGET, secondsLeft: 2, held: true } },
  { name: "Sent", state: { kind: "sent", target: TARGET, destination: "Voice chat", canUndo: false } },
  { name: "Undone", state: { kind: "undone", target: TARGET } },
  { name: "Replay buffer on", state: { kind: "replay", target: TARGET } },
  { name: "Saving a replay", state: { kind: "replay", target: TARGET, saving: true } },
  { name: "Could not send", state: { kind: "failed", target: TARGET, notice: noticeFor("send-failed") } },
];

/** Every capsule state with sample data, for people building on the capture. Reached from Experiments. */
export function Playground() {
  return (
    <div className="cap-tab" data-testid="capture-playground">
      <ul className="cap-stories" aria-label="Capsule states">
        {STORIES.map((s) => (
          <li key={s.name}>
            <h3>{s.name}</h3>
            <CapsulePill state={s.state} />
          </li>
        ))}
      </ul>
    </div>
  );
}
