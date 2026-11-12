import type { LookErrorCode, LookRequest, ScreenLook } from "@speakkit/protocol";

export type TakeResult = { ok: true; look: ScreenLook } | { ok: false; code: "no-capture" };

export interface InboxDeps {
  now(): number;
  /** How long a capture waits to be read. */
  ttlMs?: number;
}

/** A capture waits this long for the voice chat to read it. */
export const WAIT_MS = 15 * 60_000;

/**
 * The one capture that was sent to the voice chat and not read yet. The voice chat reads it through the same look call it uses for the screen; reading
 * empties the inbox, and from then on it cannot be taken back. A newer capture replaces an older one that was never read.
 */
export function createCaptureInbox(d: InboxDeps) {
  const ttl = d.ttlMs ?? WAIT_MS;
  let pending: { id: string; look: ScreenLook; at: number } | undefined;
  const listeners = new Set<() => void>();
  const live = () => (pending && d.now() - pending.at < ttl ? pending : undefined);
  const notify = () => listeners.forEach((l) => l());

  return {
    offer(id: string, look: ScreenLook): void {
      pending = { id, look, at: d.now() };
      notify();
    },
    /** True while capture `id` is waiting to be read. */
    waiting: (id: string): boolean => live()?.id === id,
    /** The voice chat reads the waiting capture. */
    take(): TakeResult {
      const p = live();
      pending = undefined;
      if (p) notify();
      return p ? { ok: true, look: p.look } : { ok: false, code: "no-capture" };
    },
    /** Takes capture `id` back before it was read. False when it was read, replaced or timed out. */
    retract(id: string): boolean {
      if (live()?.id !== id) return false;
      pending = undefined;
      notify();
      return true;
    },
    /** Called when the waiting capture is read, replaced or taken back. Returns the way to stop listening. */
    onChange(cb: () => void): () => void {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}
export type CaptureInbox = ReturnType<typeof createCaptureInbox>;

type Look = (request: LookRequest, signal: AbortSignal) => Promise<LookResult>;
type LookResult = { ok: true; look: ScreenLook } | { ok: false; code: LookErrorCode };

/** The look call of the voice chat: a capture request is answered from the inbox, everything else looks at the screen. */
export function lookOrCapture(inbox: CaptureInbox, screen: Look): Look {
  return async (request, signal) => (request.scope === "capture" ? inbox.take() : screen(request, signal));
}
