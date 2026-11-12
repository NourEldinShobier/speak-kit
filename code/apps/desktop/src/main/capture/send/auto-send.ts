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
class AutoSendImpl {
  readonly #d: AutoSendDeps;
  #phase: Phase = "idle";
  #secondsLeft = 0;
  #cancelTick: (() => void) | undefined;
  #stopListening: (() => void) | undefined;
  #undoWhileSending = false;

  constructor(deps: AutoSendDeps) {
    this.#d = deps;
  }

  get phase(): Phase {
    return this.#phase;
  }

  #stopTick() {
    this.#cancelTick?.();
    this.#cancelTick = undefined;
  }

  #tick() {
    this.#cancelTick = this.#d.schedule(() => {
      if (this.#phase !== "countdown") return;
      this.#secondsLeft -= 1;
      if (this.#secondsLeft <= 0) void this.sendNow();
      else {
        this.#d.show({ kind: "countdown", secondsLeft: this.#secondsLeft });
        this.#tick();
      }
    }, 1000);
  }

  #showSent() {
    this.#d.show({ kind: "sent", destination: this.#d.sender.destination, canUndo: this.#d.sender.canUndo() });
  }

  /** Starts the countdown; with 0 seconds the capture is handed over at once. */
  start(seconds: number): void {
    if (this.#phase !== "idle") return;
    if (seconds <= 0) return void this.sendNow();
    this.#phase = "countdown";
    this.#secondsLeft = seconds;
    this.#d.show({ kind: "countdown", secondsLeft: seconds });
    this.#tick();
  }

  hold(): void {
    if (this.#phase !== "countdown") return;
    this.#stopTick();
    this.#phase = "held";
    this.#d.show({ kind: "countdown", secondsLeft: this.#secondsLeft, held: true });
  }

  async sendNow(): Promise<void> {
    if (this.#phase !== "countdown" && this.#phase !== "held" && this.#phase !== "idle") return;
    this.#stopTick();
    this.#phase = "sending";
    const ok = await this.#d.sender.send();
    if (!ok) {
      this.#phase = "idle";
      this.#d.failed();
      return;
    }
    if (this.#undoWhileSending) {
      this.#d.sender.undo();
      this.#phase = "undone";
      this.#d.show({ kind: "undone" });
      return;
    }
    this.#phase = "sent";
    this.#stopListening = this.#d.sender.onChange(() => this.#phase === "sent" && this.#showSent());
    this.#showSent();
  }

  undo(): void {
    const { sender } = this.#d;
    if (this.#phase === "countdown" || this.#phase === "held") {
      this.#stopTick();
      this.#phase = "undone";
      this.#d.show({ kind: "undone" });
    } else if (this.#phase === "sending") this.#undoWhileSending = true;
    else if (this.#phase === "sent" && sender.canUndo() && sender.undo()) {
      this.#phase = "undone";
      this.#stopListening?.();
      this.#d.show({ kind: "undone" });
    }
  }

  /** The capsule was closed or a new capture began: nothing more happens. */
  dispose(): void {
    this.#stopTick();
    this.#stopListening?.();
    this.#phase = "undone";
  }
}

export const createAutoSend = (d: AutoSendDeps) => new AutoSendImpl(d);
export type AutoSend = AutoSendImpl;
