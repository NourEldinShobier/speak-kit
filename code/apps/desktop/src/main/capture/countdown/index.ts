export type CountdownState =
  | { kind: "counting"; secondsLeft: number }
  | { kind: "held"; secondsLeft: number }
  | { kind: "sent" }
  | { kind: "undone" }
  /** A hold ran out: nothing was sent and the capture stays saved. */
  | { kind: "expired" };

export interface CountdownOptions {
  seconds?: number;
  /** A hold ends after this long. */
  holdMaxMs?: number;
  /** True when the target can take a capture back after it was sent. Voice chat cannot. */
  canRetract?: boolean;
}

export type UndoResult = { ok: true } | { ok: false; reason: "cannot-retract" | "not-active" };

export interface Countdown {
  readonly state: CountdownState;
  /** Advances the clock. Sends when the time is up. */
  tick(now: number): void;
  /** Pauses the countdown (the pointer is on the capsule). */
  hold(now: number): void;
  release(now: number): void;
  sendNow(): void;
  /** Cancels the send. Only inside the countdown, unless the target can retract. */
  undo(): UndoResult;
}

/**
 * The send countdown after a capture: counts down, Hold pauses it, Undo cancels it while it runs. Once sent, Undo is refused with a plain reason
 * unless the target can take the capture back.
 */
export function createCountdown(startedAt: number, onSend: () => void, o: CountdownOptions = {}): Countdown {
  const { seconds = 3, holdMaxMs = 120_000, canRetract = false } = o;
  let state: CountdownState = { kind: "counting", secondsLeft: seconds };
  let deadline = startedAt + seconds * 1000;
  let heldAt = 0;
  let heldLeft = 0;
  const send = () => {
    state = { kind: "sent" };
    onSend();
  };
  return {
    get state() {
      return state;
    },
    tick(now) {
      if (state.kind === "counting") {
        if (now >= deadline) send();
        else state = { kind: "counting", secondsLeft: Math.ceil((deadline - now) / 1000) };
      } else if (state.kind === "held" && now - heldAt >= holdMaxMs) state = { kind: "expired" };
    },
    hold(now) {
      if (state.kind !== "counting") return;
      heldAt = now;
      heldLeft = Math.max(0, deadline - now);
      state = { kind: "held", secondsLeft: Math.ceil(heldLeft / 1000) };
    },
    release(now) {
      if (state.kind !== "held") return;
      deadline = now + heldLeft;
      state = { kind: "counting", secondsLeft: Math.ceil(heldLeft / 1000) };
    },
    sendNow() {
      if (state.kind === "counting" || state.kind === "held") send();
    },
    undo() {
      if (state.kind === "counting" || state.kind === "held") {
        state = { kind: "undone" };
        return { ok: true };
      }
      if (state.kind === "sent") {
        if (!canRetract) return { ok: false, reason: "cannot-retract" };
        state = { kind: "undone" };
        return { ok: true };
      }
      return { ok: false, reason: "not-active" };
    },
  };
}
