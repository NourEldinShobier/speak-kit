import type { PageContextHost } from "@speakkit/server";

export interface ActivePage extends PageContextHost {
  /** Host name of the page in front, or undefined when none was reported lately. */
  current(): string | undefined;
}

/** The page the extension last reported. A report that is not renewed expires, so a closed browser or a disabled extension cannot leave an old page behind. */
export function createActivePage(d: { now(): number; ttlMs?: number }): ActivePage {
  const ttl = d.ttlMs ?? 90_000;
  let last: { host: string; at: number } | undefined;
  return {
    report(host) {
      last = host ? { host, at: d.now() } : undefined;
    },
    current: () => (last && d.now() - last.at < ttl ? last.host : undefined),
  };
}
