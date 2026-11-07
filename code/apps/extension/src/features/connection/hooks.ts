import { useCallback, useEffect, useState } from "react";
import { getHealth, type HealthResult } from "../../shared/client";

/** Health through the service worker (it caches 3 s). Polls while mounted and the page is visible. */
export function useHealth(pollMs = 3000): { result: HealthResult | null; refresh: () => Promise<HealthResult> } {
  const [result, setResult] = useState<HealthResult | null>(null);
  const refresh = useCallback(async () => {
    const r = await getHealth(true);
    setResult(r);
    return r;
  }, []);
  useEffect(() => {
    let live = true;
    const tick = async () => {
      if (document.hidden) return;
      const r = await getHealth();
      if (live) setResult(r);
    };
    void tick();
    const id = setInterval(tick, pollMs);
    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      live = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pollMs]);
  return { result, refresh };
}

type ConnState = "checking" | "ok" | "offline" | "token";
export function connState(h: HealthResult | null): ConnState {
  if (!h) return "checking";
  if (h.ok) return "ok";
  return h.error === "token-rejected" ? "token" : "offline";
}

const PORT_MIN = 1024;
const PORT_MAX = 65535;
export const validPort = (n: number) => Number.isInteger(n) && n >= PORT_MIN && n <= PORT_MAX;
