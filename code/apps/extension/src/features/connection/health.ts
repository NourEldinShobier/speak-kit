import { API_VERSION, parseHealth, parseVoiceList, type Health, type VoiceList } from "@speakkit/protocol";
import type { ConnResult } from "../../shared/internal";

const HEALTH_TTL_MS = 3000;
const TIMEOUT_MS = 2500;

interface HealthDeps {
  fetch: typeof fetch;
  now: () => number;
  port: () => Promise<number>;
  token: () => Promise<string>;
}

const down = (): ConnResult<never> => ({
  ok: false,
  code: "app-not-running",
  message: "SpeakKit could not reach the app. Is it running?",
});
const rejected = (): ConnResult<never> => ({
  ok: false,
  code: "token-rejected",
  message: "The SpeakKit app rejected the pairing token.",
});

export function createHealthClient(deps: HealthDeps) {
  let cached: { at: number; port: number; value: ConnResult<Health> } | undefined;
  let inflight: Promise<ConnResult<Health>> | undefined;

  const get = async (path: string, port: number, token?: string) =>
    deps.fetch(`http://127.0.0.1:${port}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  async function fetchHealth(port: number): Promise<ConnResult<Health>> {
    try {
      const res = await get("/v1/health", port);
      if (!res.ok) return down();
      const h = parseHealth(await res.json());
      if (!h) return down();
      if (h.apiVersion !== API_VERSION)
        return {
          ok: false,
          code: "version-mismatch",
          message: "The SpeakKit app and extension versions do not match. Update both.",
        };
      return { ok: true, value: h };
    } catch {
      return down();
    }
  }

  return {
    /** Health of the app on the configured port, cached for 3 s; concurrent callers share one request. */
    async health(force = false): Promise<ConnResult<Health>> {
      const port = await deps.port();
      if (!force && cached && cached.port === port && deps.now() - cached.at < HEALTH_TTL_MS) return cached.value;
      if (inflight && !force) return inflight;
      const p = fetchHealth(port).then((value) => {
        cached = { at: deps.now(), port, value };
        return value;
      });
      const shared: Promise<ConnResult<Health>> = p.finally(() => {
        if (inflight === shared) inflight = undefined;
      });
      inflight = shared;
      return shared;
    },
    clear() {
      cached = undefined;
    },
    /** Token check used by the pairing UI; defaults to the stored port and token. */
    async authCheck(port?: number, token?: string): Promise<ConnResult<true>> {
      try {
        const res = await get("/v1/auth/check", port ?? (await deps.port()), token ?? (await deps.token()));
        if (res.status === 204 || res.ok) return { ok: true, value: true };
        if (res.status === 401 || res.status === 403) return rejected();
        return down();
      } catch {
        return down();
      }
    },
    async voices(): Promise<ConnResult<VoiceList>> {
      try {
        const res = await get("/v1/voices", await deps.port(), await deps.token());
        if (res.status === 401 || res.status === 403) return rejected();
        if (!res.ok) return down();
        const list = parseVoiceList(await res.json());
        return list ? { ok: true, value: list } : down();
      } catch {
        return down();
      }
    },
  };
}
