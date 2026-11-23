import { API_VERSION, DEFAULT_PORT, parseHealth, parseVoiceList, type Health, type VoiceList } from "@speakkit/protocol";
import type { ConnResult } from "../../shared/internal";
import { ignore } from "../../shared/ignore";
import { tokenRejected } from "../../shared/rejection";

const HEALTH_TTL_MS = 3000;
const TIMEOUT_MS = 2500;
/** The desktop app tries its default port and the 19 after it (listenWithFallback); the extension looks at the same ones, at most once per cooldown. */
const FALLBACK_PORTS = 20;
const SCAN_COOLDOWN_MS = 10_000;

interface HealthDeps {
  fetch: typeof fetch;
  now: () => number;
  port: () => Promise<number>;
  token: () => Promise<string>;
  /** Called with the port the app was found on after the saved one stopped answering. */
  remember?: (port: number) => Promise<void>;
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

/** True when Speak Kit answers its health route on `port`. Nothing is sent but the GET: the token goes only to a port that answered. */
async function answers(get: Get, port: number): Promise<boolean> {
  try {
    const res = await get("/v1/health", port);
    return res.ok && !!parseHealth(await res.json());
  } catch {
    return false;
  }
}

/** The first port in the app's fallback range, other than `except`, where Speak Kit answers; null when none does. */
async function findApp(get: Get, except: number): Promise<number | null> {
  const ports = Array.from({ length: FALLBACK_PORTS }, (_, i) => DEFAULT_PORT + i).filter((p) => p !== except);
  const hits = await Promise.all(ports.map((p) => answers(get, p)));
  return ports.find((_, i) => hits[i]) ?? null;
}

async function checkAuth(get: Get, deps: HealthDeps): Promise<ConnResult<true>> {
  try {
    const res = await get("/v1/auth/check", await deps.port(), await deps.token());
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
  let scannedAt = -Infinity;

  /** Health on the saved port; when nothing answers there, the app may have moved up to a free port: look once per cooldown and keep what is found. */
  async function checkApp(port: number): Promise<{ port: number; value: ConnResult<Health> }> {
    const value = await fetchHealth(get, port);
    if (value.ok || value.code !== "app-not-running" || !deps.remember || deps.now() - scannedAt < SCAN_COOLDOWN_MS) return { port, value };
    scannedAt = deps.now();
    const found = await findApp(get, port);
    if (found === null) return { port, value };
    await deps.remember(found);
    return { port: found, value: await fetchHealth(get, found) };
  }

  return {
    /** Health of the app on the saved port (or the one it moved to), cached for 3 s; concurrent callers share one request. */
    async health(force = false): Promise<ConnResult<Health>> {
      const port = await deps.port();
      if (!force && cached && cached.port === port && deps.now() - cached.at < HEALTH_TTL_MS) return cached.value;
      if (inflight && !force) return inflight;
      const p = checkApp(port).then(({ port: at, value }) => {
        cached = { at: deps.now(), port: at, value };
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
    /** Whether the app accepts the saved token. */
    authCheck: () => checkAuth(get, deps),
    voices: () => fetchVoices(get, deps),
  };
}
