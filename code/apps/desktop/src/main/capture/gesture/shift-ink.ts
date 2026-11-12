import { HOLD_MS } from ".";

/** What the Shift key did, from a key hook on Shift alone: another key or a click while it is down says Shift belongs to something else. */
export type ShiftEvent = { kind: "down" } | { kind: "up" } | { kind: "other" };
export type ShiftAction = "ink-start" | "ink-end";

export interface ShiftInk {
  event(e: ShiftEvent, at: number, recording: boolean): ShiftAction[];
  /** Call on a timer while Shift is down; reports "ink-start" once it has been held alone long enough during a recording. */
  tick(at: number, recording: boolean): ShiftAction[];
  readonly down: boolean;
  reset(): void;
}

/**
 * Shift held alone for as long as a hold of the capture key, while recording, draws. Shift with another key or a click (a capital letter, a
 * shift-click) never does. A press that began while nothing was recording is ignored until the key goes up.
 */
export function createShiftInk(): ShiftInk {
  let downAt: number | null = null;
  let usable = false;
  let inking = false;
  const none: ShiftAction[] = [];
  return {
    get down() {
      return downAt !== null;
    },
    reset() {
      downAt = null;
      usable = false;
      inking = false;
    },
    event(e, at, recording) {
      if (e.kind === "down") {
        if (downAt === null) {
          downAt = at;
          usable = recording;
        }
        return none;
      }
      if (e.kind === "other") {
        usable = false;
        return none;
      }
      const wasInking = inking;
      downAt = null;
      usable = false;
      inking = false;
      return wasInking ? ["ink-end"] : none;
    },
    tick(at, recording) {
      if (downAt === null || !usable || !recording || inking || at - downAt < HOLD_MS) return none;
      inking = true;
      return ["ink-start"];
    },
  };
}
