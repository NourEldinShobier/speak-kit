/** What the window shows before the app's first state arrives: nothing for a moment (no flash), a loading line, then an explanation with a way out. */
export type StartupView = "quiet" | "loading" | "slow";

export const LOADING_AFTER_MS = 400;
export const SLOW_AFTER_MS = 10_000;

export function startupView(waitedMs: number): StartupView {
  if (waitedMs < LOADING_AFTER_MS) return "quiet";
  return waitedMs < SLOW_AFTER_MS ? "loading" : "slow";
}
