/** Control routes (warm, hold) answer within this; the app is local, so more means it is stuck. */
export const CONTROL_MS = 8_000;
/** POST /v1/speak must start answering within this; the audio stream itself has its own idle deadline in the server. */
export const SPEAK_MS = 30_000;

/**
 * Wraps fetch so a request that gets no response headers in time is aborted with a TimeoutError.
 * The timer stops once headers arrive, so a long audio stream is not cut; the caller's own signal still aborts it.
 */
export function withDeadline(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const ctl = new AbortController();
    const ms = String(input).endsWith("/v1/speak") ? SPEAK_MS : CONTROL_MS;
    const timer = setTimeout(() => ctl.abort(new DOMException(`no response in ${ms} ms`, "TimeoutError")), ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, ctl.signal]) : ctl.signal;
    try {
      return await base(input, { ...init, signal });
    } finally {
      clearTimeout(timer);
    }
  };
}
