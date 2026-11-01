import { describe, expect, it } from "vite-plus/test";
import { siteRule } from "./rules";
import { normalizeSettings } from "./store";

describe("siteRule", () => {
  const s = normalizeSettings({
    sites: { "example.com": "never-read", "docs.foo.org": "always-dock" },
  });
  it("matches the host and its parent domains, ignoring www", () => {
    expect(siteRule(s, "https://example.com/a")).toBe("never-read");
    expect(siteRule(s, "https://www.example.com/a")).toBe("never-read");
    expect(siteRule(s, "https://blog.example.com/a")).toBe("never-read");
    expect(siteRule(s, "https://docs.foo.org/")).toBe("always-dock");
  });
  it("does not match siblings, parents of a subdomain rule or bad urls", () => {
    expect(siteRule(s, "https://foo.org/")).toBeUndefined();
    expect(siteRule(s, "https://notexample.com/")).toBeUndefined();
    expect(siteRule(s, "not a url")).toBeUndefined();
    expect(siteRule(s, undefined)).toBeUndefined();
  });

  it("falls back to the default for unlisted sites: ask leaves them alone, never-read blocks them", () => {
    expect(siteRule(normalizeSettings({}), "https://foo.org/")).toBeUndefined();
    const strict = normalizeSettings({ siteDefault: "never-read", sites: { "example.com": "always-dock" } });
    expect(siteRule(strict, "https://foo.org/")).toBe("never-read");
    expect(siteRule(strict, "https://blog.example.com/")).toBe("always-dock");
  });
  it("keeps a bad default out of the settings", () => {
    expect(normalizeSettings({ siteDefault: "always" }).siteDefault).toBe("ask");
  });
});
