import type { CaptureHandle, CaptureResult } from "./types";

/** What a capture needs from the dictation it rides on. */
interface CaptureHost {
  /** Starts a recording and returns its id, or undefined when dictation is busy. */
  begin(): number | undefined;
  finish(): void;
  cancel(): void;
}

/** The recordings whose text goes to the caller and not into a window: who waits for each, and which of them skip the text clean-up. */
export function createCaptures() {
  const waiting = new Map<number, (r: CaptureResult) => void>();
  const raw = new Set<number>();
  return {
    has: (id: number): boolean => waiting.has(id),
    isRaw: (id: number): boolean => raw.has(id),
    settle(id: number, r: CaptureResult): void {
      const settle = waiting.get(id);
      waiting.delete(id);
      raw.delete(id);
      settle?.(r);
    },
    open(opts: { raw?: boolean }, host: CaptureHost): CaptureHandle {
      let settle: (r: CaptureResult) => void = () => undefined;
      const result = new Promise<CaptureResult>((resolve) => (settle = resolve));
      const id = host.begin();
      if (id === undefined) settle({ ok: false, code: "busy" });
      else {
        waiting.set(id, settle);
        if (opts.raw) raw.add(id);
      }
      // A handle acts only while its own recording is still waiting for text.
      const owned = (): boolean => id !== undefined && waiting.get(id) === settle;
      return {
        result,
        finish: () => {
          if (owned()) host.finish();
        },
        cancel: () => {
          if (owned()) host.cancel();
        },
      };
    },
  };
}
