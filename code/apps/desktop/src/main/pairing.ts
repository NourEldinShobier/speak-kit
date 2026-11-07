import dc from "node:diagnostics_channel";
import type { IncomingMessage } from "node:http";
import type { Pairing } from "../shared/ipc";

/** Requests the app makes to its own server carry this header, so they never count as a browser pairing. */
export const APP_CLIENT_HEADER = "x-speakkit-app";

/**
 * Is this request a call from a paired client? Valid bearer token on our port. Works on node's own `http.server.request.start`
 * channel, so the server package needs no hook. Returns the Origin (the extension id) or "" when absent.
 */
export function authedCall(req: Pick<IncomingMessage, "headers" | "socket">, token: string, port: number): { origin: string } | null {
  if (!token || !port || req.socket?.localPort !== port) return null;
  if (req.headers.authorization !== `Bearer ${token}` || req.headers[APP_CLIENT_HEADER]) return null;
  const o = req.headers.origin;
  return { origin: typeof o === "string" ? o : "" };
}

export function emptyPairing(): Pairing {
  return { firstSeenMs: null, lastSeenMs: null, origin: null };
}

/** Records authenticated calls in `p`; calls `onChange` when the first call arrives or the last-seen time moves by 5 s or more. */
export function watchPairing(p: Pairing, o: { token: () => string; port: () => number; onChange: () => void; now?: () => number }): () => void {
  const now = o.now ?? Date.now;
  const fn = (m: unknown) => {
    const hit = authedCall((m as { request: IncomingMessage }).request, o.token(), o.port());
    if (!hit) return;
    const t = now();
    const first = p.firstSeenMs === null;
    const stale = p.lastSeenMs === null || t - p.lastSeenMs >= 5000;
    p.firstSeenMs ??= t;
    if (first || stale) {
      p.lastSeenMs = t;
      if (hit.origin) p.origin = hit.origin;
      o.onChange();
    }
  };
  dc.subscribe("http.server.request.start", fn);
  return () => dc.unsubscribe("http.server.request.start", fn);
}
