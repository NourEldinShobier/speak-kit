/** The longest capture. Past it the recording stops and what exists is saved, so audio and video cannot grow without end. */
export const MAX_CAPTURE_MS = 4 * 60 * 60 * 1000;

export interface LimitTimerDeps {
  ms: number;
  onLimit(): void;
  set?: (fn: () => void, ms: number) => unknown;
  clear?: (handle: unknown) => void;
}

/** One timer that runs while a capture is recording: `sync(true)` starts it once however often it is called, `sync(false)` cancels it. */
export function createLimitTimer(d: LimitTimerDeps) {
  const set = d.set ?? ((fn, ms) => setTimeout(fn, ms).unref());
  const clear = d.clear ?? ((h) => clearTimeout(h as NodeJS.Timeout));
  let handle: unknown;
  return {
    sync(recording: boolean) {
      if (recording && handle === undefined) {
        handle = set(() => {
          handle = undefined;
          d.onLimit();
        }, d.ms);
      } else if (!recording && handle !== undefined) {
        clear(handle);
        handle = undefined;
      }
    },
  };
}
