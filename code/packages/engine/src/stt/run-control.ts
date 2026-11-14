/**
 * Which speech job to stop. The worker takes jobs one at a time, but an abort arrives while one runs (or before a waiting one starts), so it is kept here:
 * a running job gets its native stop called, a waiting one is skipped when its turn comes.
 */
export function runControl(stopFailed: (e: unknown) => void) {
  const aborted = new Set<number>();
  let current: { id: number; stop?: () => unknown } | undefined;
  const stopNow = (stop: () => unknown) => void Promise.resolve().then(stop).catch(stopFailed);
  return {
    abort(id: number): void {
      aborted.add(id);
      if (current?.id === id && current.stop) stopNow(current.stop);
    },
    /** False when the job was aborted while it waited: do not run it. */
    start(id: number): boolean {
      if (aborted.delete(id)) return false;
      current = { id };
      return true;
    },
    /** Hands over the native stop of the inference that now runs; calls it at once if the abort already came. */
    attach(stop: () => unknown): void {
      if (!current) return;
      current.stop = stop;
      if (aborted.has(current.id)) stopNow(stop);
    },
    aborted: (): boolean => !!current && aborted.has(current.id),
    end(): void {
      if (current) aborted.delete(current.id);
      current = undefined;
    },
  };
}
