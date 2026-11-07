import type { SiteRule } from "@speakkit/protocol";
import type { Settings } from "./types";

type Sites = Pick<Settings, "sites" | "siteDefault">;

/** The rule that applies to a URL: exact hostname first, then parent domains ("a.b.example.com" falls back to "b.example.com", "example.com"), then the default for unlisted sites. */
export function siteRule(settings: Sites, url: string | undefined): SiteRule | undefined {
  if (!url) return undefined;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  const parts = host.split(".");
  for (let i = 0; i < Math.max(1, parts.length - 1); i++) {
    const h = parts.slice(i).join(".");
    const rule = settings.sites[h] ?? settings.sites[h.replace(/^www\./, "")];
    if (rule) return rule;
  }
  return settings.siteDefault === "never-read" ? "never-read" : undefined;
}
