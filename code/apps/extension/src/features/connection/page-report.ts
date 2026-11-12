/**
 * Tells the app which website is in front so dictation can use that site's mode. Only the host name is sent, to the app on this computer.
 * The app drops a report that is not renewed, so the same host is sent again after RENEW_MS.
 */
const RENEW_MS = 20_000;

interface PageReporterDeps {
  /** Posts the host (empty: no page in front); true when the app took it. */
  send(host: string): Promise<boolean>;
  now(): number;
}

/** The host name of a page address; "" for anything that is not an ordinary website. */
export function hostOf(url: string | undefined): string {
  if (!url || !URL.canParse(url)) return "";
  const u = new URL(url);
  return (u.protocol === "http:" || u.protocol === "https:") && /^[a-z0-9.-]+$/.test(u.hostname) ? u.hostname : "";
}

export function createPageReporter(deps: PageReporterDeps) {
  let last: { host: string; at: number } | undefined;
  return {
    /** Sends the host unless the app already has it from a moment ago. A failed send is tried again by the next call. */
    async report(host: string): Promise<void> {
      if (last && last.host === host && deps.now() - last.at < RENEW_MS) return;
      if (await deps.send(host)) last = { host, at: deps.now() };
    },
  };
}

/** Posts one report to the app with the saved token; false when there is no token, the app is not running or it refused. */
export async function postPage(d: { fetch: typeof fetch; port: () => Promise<number>; token: () => Promise<string> }, host: string): Promise<boolean> {
  try {
    const token = await d.token();
    if (!token) return false;
    const res = await d.fetch(`http://127.0.0.1:${await d.port()}/v1/page-context`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ host }),
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
