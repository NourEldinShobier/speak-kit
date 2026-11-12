/** What the capture key did, as the hook reports it. */
export type GestureEvent = { kind: "down" } | { kind: "up" } | { kind: "escape" };
export type GestureAction = "arm" | "start" | "stop" | "cancel" | "ink-start" | "ink-end";

/** A press shorter than this is a tap; longer is a hold. */
export const HOLD_MS = 300;

export interface Gesture {
  /** `recording` is whether a capture is running now: it decides what a release means. Returns what to do, in order. */
  event(e: GestureEvent, at: number, recording: boolean): GestureAction[];
  /** Call on a timer while the key is down; reports "ink-start" once the press became a hold during a recording. */
  tick(at: number, recording: boolean): GestureAction[];
  readonly down: boolean;
  reset(): void;
}

/**
 * One capture per gesture. Idle: the key arms on press and starts on release; Esc between them records nothing and the release that follows
 * does nothing. Recording: a tap stops, a hold inks until release. Key repeat while down is ignored.
 */
export function createGesture(): Gesture {
  let downAt: number | null = null;
  let cancelled = false;
  let inking = false;
  const none: GestureAction[] = [];

  return {
    get down() {
      return downAt !== null;
    },
    reset() {
      downAt = null;
      cancelled = false;
      inking = false;
    },
    event(e, at, recording) {
      if (e.kind === "down") {
        if (downAt !== null) return none;
        downAt = at;
        cancelled = false;
        return recording ? none : ["arm"];
      }
      if (e.kind === "escape") {
        if (downAt === null || recording) return none;
        cancelled = true;
        return ["cancel"];
      }
      if (downAt === null) return none;
      const held = at - downAt;
      downAt = null;
      if (cancelled) {
        cancelled = false;
        return none;
      }
      if (!recording) return ["start"];
      if (inking) {
        inking = false;
        return ["ink-end"];
      }
      return held < HOLD_MS ? ["stop"] : none;
    },
    tick(at, recording) {
      if (downAt === null || !recording || inking || at - downAt < HOLD_MS) return none;
      inking = true;
      return ["ink-start"];
    },
  };
}
