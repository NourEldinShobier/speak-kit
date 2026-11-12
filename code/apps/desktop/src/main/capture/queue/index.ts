export interface BoundedQueue<T> {
  /** Never blocks. Returns the item that was dropped to make room, if any. */
  push(item: T): T | undefined;
  shift(): T | undefined;
  readonly size: number;
  /** How many items were dropped since creation. */
  readonly dropped: number;
}

/** A queue with a fixed size for video frames: when it is full the oldest frame goes, so the capture side never waits for a slow writer. */
export function createBoundedQueue<T>(limit: number): BoundedQueue<T> {
  if (!(limit >= 1)) throw new RangeError("limit must be at least 1");
  const items: T[] = [];
  let dropped = 0;
  return {
    push(item) {
      let out: T | undefined;
      if (items.length >= limit) {
        out = items.shift();
        dropped++;
      }
      items.push(item);
      return out;
    },
    shift: () => items.shift(),
    get size() {
      return items.length;
    },
    get dropped() {
      return dropped;
    },
  };
}
