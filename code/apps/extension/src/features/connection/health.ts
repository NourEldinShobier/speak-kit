import { API_VERSION, parseHealth, parseVoiceList, type Health, type VoiceList } from "@speakkit/protocol";
import type { ConnResult } from "../../shared/internal";
import { ignore } from "../../shared/ignore";
import { tokenRejected } from "../../shared/rejection";

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
  message: "Speak Kit could not reach the app. Is it running?",
});
const rejected = (): ConnResult<never> => ({
  ok: false,
  code: "token-rejected",
  message: "The Speak Kit app rejected the pairing token.",
});

/** The JSON of an error answer; an answer that is not an error is not read. */
const bodyOf = (res: Response): Promise<unknown> => (res.ok ? Promise.resolve(undefined) : res.json().catch(ignore));

type Get = (path: string, port: number, token?: string) => Promise<Response>;

const makeGet =
  (deps: HealthDeps): Get =>
  async (path, port, token) =>
    deps.fetch(`http://127.0.0.1:${port}${path}`, {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

async function fetchHealth(get: Get, port: number): Promise<ConnResult<Health>> {
  try {
    const res = await get("/v1/health", port);
    if (!res.ok) return down();
    const h = parseHealth(await res.json());
    if (!h) return down();
    if (h.apiVersion !== API_VERSION) return { ok: false, code: "version-mismatch", message: "The Speak Kit app and extension versions do not match. Update both." };
    return { ok: true, value: h };
  } catch {
    return down();
  }
}

async function checkAuth(get: Get, deps: HealthDeps, override: { port?: number | undefined; token?: string | undefined }): Promise<ConnResult<true>> {
  try {
    const res = await get("/v1/auth/check", override.port ?? (await deps.port()), override.token ?? (await deps.token()));
    if (res.status === 204 || res.ok) return { ok: true, value: true };
    return tokenRejected(res.status, await bodyOf(res)) ? rejected() : down();
  } catch {
    return down();
  }
}

async function fetchVoices(get: Get, deps: HealthDeps): Promise<ConnResult<VoiceList>> {
  try {
    const res = await get("/v1/voices", await deps.port(), await deps.token());
    if (tokenRejected(res.status, await bodyOf(res))) return rejected();
    if (!res.ok) return down();
    const list = parseVoiceList(await res.json());
    return list ? { ok: true, value: list } : down();
  } catch {
    return down();
  }
}

export function createHealthClient(deps: HealthDeps) {
  let cached: { at: number; port: number; value: ConnResult<Health> } | undefined;
  let inflight: Promise<ConnResult<Health>> | undefined;
  const get = makeGet(deps);

  return {
    /** Health of the app on the configured port, cached for 3 s; concurrent callers share one request. */
    async health(force = false): Promise<ConnResult<Health>> {
      const port = await deps.port();
      if (!force && cached && cached.port === port && deps.now() - cached.at < HEALTH_TTL_MS) return cached.value;
      if (inflight && !force) return inflight;
      const p = fetchHealth(get, port).then((value) => {
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
    authCheck: (port?: number, token?: string) => checkAuth(get, deps, { port, token }),
    voices: () => fetchVoices(get, deps),
  };
}
