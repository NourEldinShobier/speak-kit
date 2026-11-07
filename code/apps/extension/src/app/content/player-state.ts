import type { HelloReply, PlayerState, PlayerStatus } from "@speakkit/protocol";

/** Statuses in which something is being read (the page shows the highlight and scroll tracking). */
export const ACTIVE: readonly string[] = ["preparing", "playing", "paused"] satisfies PlayerStatus[];
const STATUSES: readonly string[] = ["idle", "preparing", "playing", "paused", "finished", "error"] satisfies PlayerStatus[];

/**
 * The worker's answer to get-state, checked before the page trusts it. Hand-written on purpose: this file is in the script
 * injected into every page, and a schema library would add about 2 KB gzip to it.
 */
export function asPlayerState(x: unknown): PlayerState | undefined {
  const s = x as Partial<Record<keyof PlayerState, unknown>> | null;
  const ok =
    typeof s === "object" &&
    s !== null &&
    typeof s.status === "string" &&
    STATUSES.includes(s.status) &&
    typeof s.sentenceIndex === "number" &&
    typeof s.sentenceCount === "number" &&
    typeof s.elapsedMs === "number" &&
    typeof s.totalMs === "number";
  return ok ? (x as PlayerState) : undefined;
}

/** The worker's answer to hello, checked like get-state: the running state of this document, if any, and whether the tab was closed. */
export function asHello(x: unknown): HelloReply | undefined {
  const r = x as Partial<Record<keyof HelloReply, unknown>> | null;
  if (typeof r !== "object" || r === null || typeof r.dismissed !== "boolean") return undefined;
  return { dismissed: r.dismissed, state: r.state ? (asPlayerState(r.state) ?? null) : null };
}
