import type { VoiceChatErrorCode, VoiceChatSession } from "@speakkit/protocol";

export type MintResult = { ok: true; session: VoiceChatSession } | { ok: false; code: VoiceChatErrorCode };

/** What the host app provides for voice chat. It owns the OpenAI API key; the server never sees it. */
export interface VoiceChatService {
  hasKey(): Promise<boolean>;
  /** Asks OpenAI for a short-lived Realtime client secret. Aborts with `signal`. */
  mint(signal: AbortSignal): Promise<MintResult>;
}

export const MINTS_PER_WINDOW = 10;
const WINDOW_MS = 60_000;

/** Sliding-window limit on mint attempts (failed ones count too), so a bug or a hostile local client cannot spend money in a loop. */
export class MintLimiter {
  #times: number[] = [];
  #max: number;
  #now: () => number;
  constructor(max = MINTS_PER_WINDOW, now: () => number = Date.now) {
    this.#max = max;
    this.#now = now;
  }

  /** Records an attempt and returns 0, or the seconds to wait when the limit is reached (the attempt is then not recorded). */
  take(): number {
    const t = this.#now();
    this.#times = this.#times.filter((x) => t - x < WINDOW_MS);
    if (this.#times.length >= this.#max) return Math.ceil((this.#times[0]! + WINDOW_MS - t) / 1000);
    this.#times.push(t);
    return 0;
  }
}
