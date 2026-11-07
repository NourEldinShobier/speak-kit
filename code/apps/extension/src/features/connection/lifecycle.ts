/**
 * Client side of the model lifecycle. The extension never assumes the model is
 * loaded: it asks the app to warm it ahead of the click and to hold it while playback is paused. Both calls are
 * best-effort; a failure (app not running, older app without the endpoint) is ignored.
 */
const WARM_DEBOUNCE_MS = 5000;

interface EngineClientDeps {
  fetch: typeof fetch;
  port: () => Promise<number>;
  token: () => Promise<string>;
  now?: () => number;
}

export function createEngineClient(deps: EngineClientDeps) {
  const now = deps.now ?? Date.now;
  let lastWarm = -Infinity;

  async function post(path: string, body?: unknown): Promise<boolean> {
    try {
      const token = await deps.token();
      if (!token) return false;
      const res = await deps.fetch(`http://127.0.0.1:${await deps.port()}${path}`, {
        method: "POST",
        headers: body === undefined ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(2500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return {
    /** POST /v1/engine/warm. Skipped when called again within WARM_DEBOUNCE_MS (hover and selection events are noisy). */
    async warm(force = false): Promise<boolean> {
      const t = now();
      if (!force && t - lastWarm < WARM_DEBOUNCE_MS) return false;
      lastWarm = t;
      return post("/v1/engine/warm");
    },
    /** POST /v1/engine/hold: keep a loaded model for `ms` more (600000 on pause, 0 on resume). */
    hold: (ms: number) => post("/v1/engine/hold", { ms }),
    reset() {
      lastWarm = -Infinity;
    },
  };
}
