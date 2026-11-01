import type { ProxyChunk, ProxyRequest } from "../../shared/library/contract";

interface ProxyDeps {
  /** where the local server listens now, and the token to present */
  target(): { port: number; token: string };
  fetch?: typeof fetch;
}

/** Streams relayed at once. The reader uses one or two; a cap keeps a buggy or hostile renderer from opening unbounded upstream streams. */
export const MAX_OPEN_REQUESTS = 8;

/**
 * Relays the reader's requests to the local server. The renderer's origin is file://, which the server rejects by design
 * (only no Origin or chrome-extension://), so main makes the call: no Origin header, token added here, only three paths.
 */
export function createSpeakProxy({ target, fetch: doFetch = fetch }: ProxyDeps) {
  const running = new Map<number, AbortController>();

  async function open(req: ProxyRequest, send: (chunk: ProxyChunk) => void): Promise<void> {
    if (running.size >= MAX_OPEN_REQUESTS) return send({ id: req.id, type: "error", message: "Too many requests at once." });
    const abort = new AbortController();
    running.set(req.id, abort);
    const { port, token } = target();
    try {
      const res = await doFetch(`http://127.0.0.1:${port}${req.path}`, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(req.body ? { "Content-Type": "application/json" } : {}),
          ...(req.replace ? { "X-SpeakKit-Replace": req.replace } : {}),
        },
        ...(req.body ? { body: req.body } : {}),
        signal: abort.signal,
      });
      send({ id: req.id, type: "head", status: res.status });
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          send({ id: req.id, type: "data", data: value });
        }
      }
      send({ id: req.id, type: "end" });
    } catch (e) {
      if (!abort.signal.aborted) send({ id: req.id, type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      running.delete(req.id);
    }
  }

  return {
    open,
    cancel: (id: number) => running.get(id)?.abort(),
    /** The window that asked is gone. */
    cancelAll: () => running.forEach((a) => a.abort()),
  };
}
