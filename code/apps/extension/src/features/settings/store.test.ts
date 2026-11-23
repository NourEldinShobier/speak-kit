import { PORT_KEY, SETTINGS_KEY, TOKEN_KEY } from "@speakkit/protocol";
import { defaultSettings } from "./types";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { getPort, getToken, invalidateSettings, loadSettings, mergeSettings, normalizeSettings, savePort, saveSettings } from "./store";

function stubChrome(sync: Record<string, unknown>, local: Record<string, unknown> = {}) {
  const area = (data: Record<string, unknown>) => ({
    get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => k in data).map((k) => [k, data[k]])),
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

  it("ignores a stored dark reader theme from before the app became light only", () => {
    expect(normalizeSettings({ reader: { theme: "dark", size: 20 } }).reader).toEqual({ ...defaultSettings().reader, size: 20 });
  });

  it("replaces the id of a cloned voice of an earlier version with the default voice", () => {
    expect(normalizeSettings({ voice: "cb_0a1b2c3d" }).voice).toBe(defaultSettings().voice);
    expect(normalizeSettings({ voice: "cb_0a1b2c3d4" }).voice).toBe("cb_0a1b2c3d4");
  });

  it("keeps valid values, clamps numbers and rejects wrong types and enums", () => {
    const s = normalizeSettings({
      speed: 9,
      voice: "bm_george",
      pauseBetweenParagraphs: "huge",
      launcher: { side: "left", idle: "peek", openOn: "click", closeDelayMs: 99, widerWhileReading: false, y: -3, enabled: "yes" },
      show: { dock: false },
      highlight: { mode: "word" },
      sites: { "a.com": "never-read", "b.com": "weird" },
      unknownKey: 1,
    });
    expect(s.speed).toBe(3);
    expect(s.voice).toBe("bm_george");
    expect(s.pauseBetweenParagraphs).toBe("short");
    expect(s.launcher).toEqual({ enabled: true, y: 0 });
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
    expect(await loadSettings()).toMatchObject({ speed: 1.8, voice: "af_nicole" });
  });

  it("repairs invalid stored data on load and gives the removed port setting no effect", async () => {
    stubChrome({ [SETTINGS_KEY]: { speed: "fast", port: 1234 } });
    const s = await loadSettings();
    expect(s.speed).toBe(1.2);
    expect(s).not.toHaveProperty("port");
  });

  it("reads the port the app was found on from local storage, the default otherwise, and never from the old synced setting", async () => {
    stubChrome({ [SETTINGS_KEY]: { port: 1234 } }, {});
    expect(await getPort()).toBe(47615);
    await savePort(47620);
    expect(await getPort()).toBe(47620);
    stubChrome({}, { [PORT_KEY]: 99999 });
    expect(await getPort()).toBe(47615);
  });

  it("reads the token from local storage only", async () => {
    stubChrome({ [TOKEN_KEY]: "wrong-area" }, { [TOKEN_KEY]: "abc" });
    expect(await getToken()).toBe("abc");
    stubChrome({}, {});
    expect(await getToken()).toBe("");
  });
});
