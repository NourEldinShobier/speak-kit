import type { Session, Target } from "./session";

export interface SwitchDeps {
  session(): Pick<Session, "state" | "switchTarget">;
  /** Shows the picker; resolves null on Esc or when aborted. */
  pick(signal: AbortSignal): Promise<Target | null>;
  /** The capsule says "Choose what to record" while this is true. */
  setSwitching(on: boolean): void;
}

export interface SwitchFlow {
  /** Picks a new target while recording and moves the recording to it; the microphone keeps running. */
  run(): Promise<"switched" | "cancelled" | "failed" | "busy">;
  /** The recording ended or was thrown away: an open picker closes. */
  cancel(): void;
}

export function createSwitchFlow(d: SwitchDeps): SwitchFlow {
  let abort: AbortController | undefined;
  return {
    async run() {
      if (abort || d.session().state.phase !== "recording") return "busy";
      const mine = (abort = new AbortController());
      d.setSwitching(true);
      try {
        const target = await d.pick(mine.signal);
        if (!target || mine.signal.aborted) return "cancelled";
        return (await d.session().switchTarget(target)) ? "switched" : "failed";
      } finally {
        if (abort === mine) abort = undefined;
        d.setSwitching(false);
      }
    },
    cancel: () => abort?.abort(),
  };
}
