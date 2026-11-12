/**
 * Generation fence: every recording gets a number when it opens, and what the recorder window streams back carries that number. Anything from an
 * earlier recording (a chunk that was still in flight when it was discarded) or from after the fence closed is refused, so it can never be written
 * into the files of the capture that is on now.
 */
export interface Fence {
  /** Opens a new generation and returns its number; the one before is no longer accepted. */
  open(): number;
  /** No generation is accepted until the next open. */
  close(): void;
  accepts(gen: number): boolean;
  /** How many refused items so far, for the log. */
  readonly refused: number;
  /** Counts one refused item. */
  refuse(): void;
}

export function createFence(): Fence {
  let current = 0;
  let live = false;
  let refused = 0;
  return {
    open: () => {
      live = true;
      return ++current;
    },
    close: () => {
      live = false;
    },
    accepts: (gen) => live && gen === current,
    get refused() {
      return refused;
    },
    refuse: () => {
      refused++;
    },
  };
}
