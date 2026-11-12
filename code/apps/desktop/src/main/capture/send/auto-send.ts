export type SendView = { kind: "countdown"; secondsLeft: number; held?: boolean } | { kind: "sent"; destination: string; canUndo: boolean } | { kind: "undone" };

/** Where a finished capture goes. Undo works only while the destination has not read it. */
export interface Sender {
  destination: string;
  /** Hands the capture over; false when it could not be. */
  send(): Promise<boolean>;
  canUndo(): boolean;
  undo(): boolean;
  /** Called when canUndo may have changed. Returns the way to stop listening. */
  onChange(cb: () => void): () => void;
}

export interface AutoSendDeps {
  sender: Sender;
  /** Runs fn once after ms; returns the way to cancel it. */
  schedule(fn: () => void, ms: number): () => void;
  show(view: SendView | undefined): void;
  /** The capture could not be handed over. */
  failed(): void;
}

type Phase = "idle" | "countdown" | "held" | "sending" | "sent" | "undone";

/**
 * What happens after a capture is saved when it goes to another place: a countdown the person can hold or undo, then the hand-over. Undo works inside
 * the countdown, and after it only when the destination can still give the capture back; the capsule says plainly when it cannot.
 */
export function createAutoSend(d: AutoSendDeps) {
  let phase: Phase = "idle";
  let secondsLeft = 0;
  let cancelTick: (() => void) | undefined;
  let stopListening: (() => void) | undefined;
  let undoWhileSending = false;

  const stopTick = () => {
    cancelTick?.();
    cancelTick = undefined;
  };
  const tick = () => {
    cancelTick = d.schedule(() => {
      if (phase !== "countdown") return;
      secondsLeft -= 1;
      if (secondsLeft <= 0) void sendNow();
      else {
        d.show({ kind: "countdown", secondsLeft });
        tick();
      }
    }, 1000);
  };
  const showSent = () => d.show({ kind: "sent", destination: d.sender.destination, canUndo: d.sender.canUndo() });

  async function sendNow(): Promise<void> {
    if (phase !== "countdown" && phase !== "held" && phase !== "idle") return;
    stopTick();
    phase = "sending";
    const ok = await d.sender.send();
    if (!ok) {
      phase = "idle";
      d.failed();
      return;
    }
    if (undoWhileSending) {
      d.sender.undo();
      phase = "undone";
      d.show({ kind: "undone" });
      return;
    }
    phase = "sent";
    stopListening = d.sender.onChange(() => phase === "sent" && showSent());
    showSent();
  }

  return {
    /** Starts the countdown; with 0 seconds the capture is handed over at once. */
    start(seconds: number): void {
      if (phase !== "idle") return;
      if (seconds <= 0) return void sendNow();
      phase = "countdown";
      secondsLeft = seconds;
      d.show({ kind: "countdown", secondsLeft });
      tick();
    },
    hold(): void {
      if (phase !== "countdown") return;
      stopTick();
      phase = "held";
      d.show({ kind: "countdown", secondsLeft, held: true });
    },
    sendNow,
    undo(): void {
      if (phase === "countdown" || phase === "held") {
        stopTick();
        phase = "undone";
        d.show({ kind: "undone" });
      } else if (phase === "sending") undoWhileSending = true;
      else if (phase === "sent" && d.sender.canUndo() && d.sender.undo()) {
        phase = "undone";
        stopListening?.();
        d.show({ kind: "undone" });
      }
    },
    /** The capsule was closed or a new capture began: nothing more happens. */
    dispose(): void {
      stopTick();
      stopListening?.();
      phase = "undone";
    },
    get phase(): Phase {
      return phase;
    },
  };
}
export type AutoSend = ReturnType<typeof createAutoSend>;
