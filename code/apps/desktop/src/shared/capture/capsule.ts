import type { Notice } from "./notices";

export type StepState = "done" | "active" | "waiting";

/** Everything the capsule can be in. The main process picks one; the capsule page only draws it. */
export type CapsuleState =
  | { kind: "recording"; target: string; elapsedMs: number; pen: boolean; micMissing?: boolean; dictationPaused?: boolean; switching?: boolean; confirmDiscard?: boolean }
  | { kind: "finishing"; target: string; steps: { label: string; state: StepState }[] }
  | { kind: "saved"; target: string; what: string }
  | { kind: "countdown"; target: string; secondsLeft: number; held?: boolean }
  | { kind: "sent"; target: string; destination: string; canUndo: boolean }
  | { kind: "undone"; target: string }
  | { kind: "shot"; target: string; what: string }
  | { kind: "failed"; target: string; notice: Notice };

export type CapsuleButtonId =
  | "pen"
  | "stop"
  | "discard"
  | "discard-keep"
  | "discard-confirm"
  | "open"
  | "send"
  | "hold"
  | "undo"
  | "send-now"
  | "retry"
  | "dismiss"
  | "switch"
  | "copy-again"
  | "copy-path";

export interface CapsuleButton {
  id: CapsuleButtonId;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  pressed?: boolean;
}

export interface CapsuleView {
  /** Name of the target on the chip. */
  chip: string;
  /** The main line, or the lines of a notice. */
  text: string;
  detail?: string | undefined;
  tone: "normal" | "error" | "warning";
  timer?: string;
  /** Finishing steps, in order. */
  steps?: { label: string; state: StepState }[];
  buttons: CapsuleButton[];
  /** The recording dot beats while this is true. */
  live: boolean;
}

export const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type Recording = Extract<CapsuleState, { kind: "recording" }>;

const view = (chip: string, text: string, buttons: CapsuleButton[]): CapsuleView => ({ chip, text, tone: "normal", live: false, buttons });

function recordingLine(c: Recording): string {
  if (c.switching) return "Choose what to record";
  if (c.micMissing) return "No microphone. Recording the screen only.";
  if (c.dictationPaused) return "Dictation is paused while recording";
  return c.pen ? "Pen on" : "Recording";
}

function recordingView(c: Recording): CapsuleView {
  if (c.confirmDiscard)
    return view(c.target, "Discard this recording?", [
      { id: "discard-keep", label: "Keep recording" },
      { id: "discard-confirm", label: "Discard" },
    ]);
  const buttons: CapsuleButton[] = [
    { id: "pen", label: "Pen", pressed: c.pen },
    { id: "switch", label: "Switch", disabled: !!c.switching },
    { id: "stop", label: "Stop", primary: true },
    { id: "discard", label: "Discard" },
  ];
  return { ...view(c.target, recordingLine(c), buttons), timer: clock(c.elapsedMs), live: true, tone: c.micMissing ? "warning" : "normal" };
}

function countdownView(c: Extract<CapsuleState, { kind: "countdown" }>): CapsuleView {
  if (c.held)
    return view(c.target, "Held. Not sent yet.", [
      { id: "send-now", label: "Send now", primary: true },
      { id: "undo", label: "Undo" },
    ]);
  return view(c.target, `Sending to Voice chat in ${c.secondsLeft}`, [
    { id: "hold", label: "Hold" },
    { id: "undo", label: "Undo" },
  ]);
}

/** The words and buttons of each capsule state. */
export function capsuleView(c: CapsuleState): CapsuleView {
  switch (c.kind) {
    case "recording":
      return recordingView(c);
    case "finishing":
      return { ...view(c.target, c.steps.find((s) => s.state === "active")?.label ?? "Finishing", []), steps: c.steps };
    case "saved":
      return view(c.target, c.what, [
        { id: "open", label: "Open" },
        { id: "send", label: "Send" },
        { id: "dismiss", label: "Close" },
      ]);
    case "countdown":
      return countdownView(c);
    case "sent":
      return {
        ...view(c.target, `Sent to ${c.destination}`, [
          { id: "undo", label: "Undo", disabled: !c.canUndo },
          { id: "dismiss", label: "Close" },
        ]),
        detail: c.canUndo ? undefined : `${c.destination} already has the capture and cannot take it back.`,
      };
    case "shot":
      return view(c.target, c.what, [
        { id: "copy-again", label: "Copy again" },
        { id: "copy-path", label: "Copy path" },
        { id: "open", label: "Open" },
        { id: "dismiss", label: "Close" },
      ]);
    case "undone":
      return view(c.target, "Not sent. The capture is saved and copied.", [
        { id: "open", label: "Open" },
        { id: "dismiss", label: "Close" },
      ]);
    case "failed":
      return { ...view(c.target, c.notice.title, [{ id: "retry", label: c.notice.actionLabel }]), detail: c.notice.body, tone: c.notice.tone === "error" ? "error" : "warning" };
  }
}
