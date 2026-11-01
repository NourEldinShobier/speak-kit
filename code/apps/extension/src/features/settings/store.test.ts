import { SETTINGS_KEY, TOKEN_KEY } from "@speakkit/protocol";
import { defaultSettings } from "./types";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  getToken,
  invalidateSettings,
  loadSettings,
  mergeSettings,
  normalizeSettings,
  saveSettings,
  siteRule,
} from "./store";

function stubChrome(sync: Record<string, unknown>, local: Record<string, unknown> = {}) {
  const area = (data: Record<string, unknown>) => ({
    get: async (keys: string | string[]) =>
      Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys]).filter((k) => k in data).map((k) => [k, data[k]]),
      ),
    set: async (o: Record<string, unknown>) => {
      Object.assign(data, o);
    },
  });
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { sync: area(sync), local: area(local) },
  };
  invalidateSettings();
}

describe("normalizeSettings", () => {
  it("returns defaults for missing or garbage data", () => {
    expect(normalizeSettings(undefined)).toEqual(defaultSettings());
    expect(normalizeSettings("x")).toEqual(defaultSettings());
    expect(normalizeSettings([])).toEqual(defaultSettings());
  });

  it("keeps valid values, clamps numbers and rejects wrong types and enums", () => {
    const s = normalizeSettings({
      port: 70000,
      speed: 9,
      voice: "bm_george",
      pauseBetweenParagraphs: "huge",
      launcher: { side: "left", y: -3, idle: "bogus", enabled: "yes" },
      show: { dock: false },
      highlight: { mode: "word" },
      sites: { "a.com": "never-read", "b.com": "weird" },
      unknownKey: 1,
    });
    expect(s.port).toBe(65535);
    expect(s.speed).toBe(3);
    expect(s.voice).toBe("bm_george");
    expect(s.pauseBetweenParagraphs).toBe("short");
    expect(s.launcher).toMatchObject({ side: "left", y: 0, idle: "peek", enabled: true });
    expect(s.show).toMatchObject({ dock: false, bubble: true });
    expect(s.highlight.mode).toBe("word");
    expect(s.sites).toEqual({ "a.com": "never-read" });
    expect("unknownKey" in s).toBe(false);
  });

  it("fills groups added in newer versions", () => {
    const old = { ...defaultSettings() } as Record<string, unknown>;
    delete old.skip;
    expect(normalizeSettings(old).skip).toEqual(defaultSettings().skip);
  });
});

describe("mergeSettings", () => {
  it("merges nested groups key by key but replaces sites wholesale", () => {
    const cur = normalizeSettings({ show: { bubble: false }, sites: { "a.com": "never-read" } });
    const next = mergeSettings(cur, { show: { dock: false }, sites: { "b.com": "hide-controls" } });
    expect(next.show).toMatchObject({ bubble: false, dock: false });
    expect(next.sites).toEqual({ "b.com": "hide-controls" });
  });
});

describe("storage round trip", () => {
  beforeEach(() => stubChrome({}));

  it("loads defaults, saves a patch and reads it back", async () => {
    expect((await loadSettings()).speed).toBe(1.2);
    await saveSettings({ speed: 1.8, voice: "af_nicole" });
    invalidateSettings();
    expect(await loadSettings()).toMatchObject({ speed: 1.8, voice: "af_nicole", port: 47615 });
  });

  it("repairs invalid stored data on load", async () => {
    stubChrome({ [SETTINGS_KEY]: { speed: "fast", port: 1234 } });
    expect(await loadSettings()).toMatchObject({ speed: 1.2, port: 1234 });
  });

  it("reads the token from local storage only", async () => {
    stubChrome({ [TOKEN_KEY]: "wrong-area" }, { [TOKEN_KEY]: "abc" });
    expect(await getToken()).toBe("abc");
    stubChrome({}, {});
    expect(await getToken()).toBe("");
  });
});

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
});
