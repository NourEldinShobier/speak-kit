import type { CallPolicy, CallSession } from "./types";

export type Policies = Readonly<Record<string, CallPolicy>>;

export const DEFAULT_POLICY: CallPolicy = "ask";

export const policyFor = (policies: Policies, providerId: string): CallPolicy => policies[providerId] ?? DEFAULT_POLICY;

/** What the offer asks for: the capsule shown, or the call recorded without asking. */
export type OfferAction = { kind: "offer"; session: CallSession } | { kind: "record"; session: CallSession } | { kind: "none" };

export type Dismiss = "close" | "this-call" | "never";

interface Offered {
  session: CallSession;
  state: "shown" | "snoozed" | "recording" | "declined";
}

export interface OfferOptions {
  /** The feature switch: off means nothing is offered and nothing is recorded by itself. */
  enabled(): boolean;
  policies(): Policies;
  /** Sets a provider's policy (the "never offer for this app" choice). */
  setPolicy(providerId: string, policy: CallPolicy): void;
}

/**
 * The offer to record a call. It stays until the person answers or the call ends, a call that ends takes its offer with it, and the next call of the same
 * app is a new offer. Nothing is ever recorded because time passed: only "Always record" for the app, or the person's own Record.
 * A snooze belongs to the call (session), not to the app.
 */
export class Offers {
  readonly #o: OfferOptions;
  readonly #by = new Map<string, Offered>();

  constructor(o: OfferOptions) {
    this.#o = o;
  }

  /** The offers on screen now (one per call that waits for an answer). */
  get shown(): CallSession[] {
    return [...this.#by.values()].filter((x) => x.state === "shown").map((x) => x.session);
  }

  started(session: CallSession): OfferAction {
    if (!this.#o.enabled()) return { kind: "none" };
    const policy = policyFor(this.#o.policies(), session.providerId);
    if (policy === "never") return { kind: "none" };
    if (policy === "always") {
      this.#by.set(session.id, { session, state: "recording" });
      return { kind: "record", session };
    }
    this.#by.set(session.id, { session, state: "shown" });
    return { kind: "offer", session };
  }

  /** The person pressed Record on the offer (or the shortcut during a call). */
  accepted(sessionId: string): CallSession | undefined {
    const x = this.#by.get(sessionId);
    if (!x) return undefined;
    x.state = "recording";
    return x.session;
  }

  dismissed(sessionId: string, how: Dismiss): void {
    const x = this.#by.get(sessionId);
    if (!x) return;
    // "close" and "this call" both end this call's offer; neither touches the app, so the next call asks again.
    x.state = how === "close" ? "declined" : "snoozed";
    if (how === "never") this.#o.setPolicy(x.session.providerId, "never");
  }

  /** The call ended: its offer goes, whatever the state. Returns whether it was waiting for an answer. */
  ended(sessionId: string): boolean {
    const x = this.#by.get(sessionId);
    this.#by.delete(sessionId);
    return x?.state === "shown";
  }

  /** The feature was turned off: every waiting offer goes. */
  clear(): CallSession[] {
    const gone = this.shown;
    this.#by.clear();
    return gone;
  }
}

/** What happens when the call ends while it is being recorded. */
export type EndPlan = { kind: "countdown"; seconds: number } | { kind: "ask" } | { kind: "keep" };

export const END_COUNTDOWN_SECONDS = 15;

/** With "stop when the call ends" on, a countdown starts that the person can cancel; with it off, the person is asked; a recording started by hand for no call is left alone. */
export function endPlan(o: { stopWhenEnds: boolean; forCall: boolean }): EndPlan {
  if (!o.forCall) return { kind: "keep" };
  return o.stopWhenEnds ? { kind: "countdown", seconds: END_COUNTDOWN_SECONDS } : { kind: "ask" };
}
