import type { Health } from "@speakkit/protocol";
import { createEngineClient, createHealthClient, launchApp } from "../../features/connection";
import { getToken, loadSettings } from "../../features/settings";
import { sleep } from "../../shared/ignore";
import { LINKS } from "../../shared/links";

/** What the app clients need to reach the app: the fetch, the saved port and the saved token. */
export const net = { fetch: (i: RequestInfo | URL, init?: RequestInit) => fetch(i, init), port: async () => (await loadSettings()).port, token: getToken };

export const health = createHealthClient({ ...net, now: Date.now });

export const engine = createEngineClient(net);

// The UI wants HealthResult ({ ok, health, ms } | { ok: false, error }); /v1/health needs no token, so the token is checked separately.
type HealthResult = { ok: true; health: Health; ms: number } | { ok: false; error: "app-not-running" | "token-rejected" | "version-mismatch"; detail?: string };

let cached: { at: number; port: number; token: string; value: HealthResult } | undefined;

export const clearHealth = () => {
  cached = undefined;
  health.clear();
};

export async function getHealthResult(force = false): Promise<HealthResult> {
  const port = (await loadSettings()).port;
  const token = await getToken();
  if (!force && cached && cached.port === port && cached.token === token && Date.now() - cached.at < 3000) return cached.value;
  const t0 = Date.now();
  const r = await health.health(force);
  let value: HealthResult;
  if (!r.ok) value = { ok: false, error: r.code as "app-not-running" | "version-mismatch", detail: r.message };
  else {
    const auth = token ? await health.authCheck() : undefined;
    value = auth && !auth.ok ? { ok: false, error: auth.code as "token-rejected" | "app-not-running", detail: auth.message } : { ok: true, health: r.value, ms: Date.now() - t0 };
  }
  cached = { at: Date.now(), port, token, value };
  return value;
}

/** Opens the speakkit:// link in a background tab and waits for the app to answer. */
export async function startApp() {
  const r = await launchApp({
    openTab: async () => (await chrome.tabs.create({ url: LINKS.launch, active: false })).id,
    closeTab: (id) => chrome.tabs.remove(id),
    isRunning: async () => (await getHealthResult(true)).ok,
    sleep,
  });
  clearHealth();
  return r;
}
