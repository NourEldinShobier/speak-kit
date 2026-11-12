import type { Clip, Clock, Unsubscribe } from "./types";

/** A cancelled recording can be brought back for this long. */
export const UNDO_MS = 60_000;

/**
 * The one cancelled take that can still be undone. A newer cancel, a new recording or the end of the minute lets it go, and `released` tells the app it may
 * drop any copy of it that it kept; an undo hands it over instead, and the job that runs it reports it when it is done.
 */
export function createCancelledTake(clock: Clock, released: (clip: Clip) => void) {
  let clip: Clip | undefined;
  let stopTimer: Unsubscribe | undefined;

  const release = (): void => {
    stopTimer?.();
    stopTimer = undefined;
    const old = clip;
    clip = undefined;
    if (!old) return;
    try {
      released(old);
    } catch {
      // the app's bookkeeping must not stop a recording
    }
  };

  return {
    /** Holds `next` for the undo minute; whatever was held before is released. */
    keep(next: Clip): void {
      release();
      clip = next;
      stopTimer = clock.after(UNDO_MS, release);
    },
    release,
    /** The held take for an undo, which is then no longer held. */
    take(): Clip | undefined {
      const taken = clip;
      clip = undefined;
      stopTimer?.();
      stopTimer = undefined;
      return taken;
    },
    held: (): boolean => clip !== undefined,
  };
}
