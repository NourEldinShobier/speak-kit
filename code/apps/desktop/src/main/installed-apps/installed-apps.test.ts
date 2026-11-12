import { describe, expect, it } from "vitest";
import { createInstalledApps, fixedInstalledApps } from "./index";
import type { MacHost } from "./macos";
import type { WindowsHost } from "./windows";

const tree = (files: Record<string, string[]>) => (dir: string) => (files[dir] ? Promise.resolve(files[dir]!) : Promise.reject(new Error("ENOENT")));

const win = (links: Record<string, string>, dirs: Record<string, string[]>, roots = ["P"]): WindowsHost => ({
  roots: () => roots,
  list: async (dir) => (await tree(dirs)(dir)).map((name) => ({ name, directory: !name.includes(".") })),
  target: (s) => links[s] ?? "",
  pause: async () => {},
  join: (a, b) => `${a}/${b}`,
});

const mac = (ids: Record<string, string | null>, dirs: Record<string, string[]>): MacHost => ({
  roots: () => ["/Applications", "/Missing"],
  list: tree(dirs),
  bundleId: async (app) => {
    const id = ids[app];
    if (id === undefined) throw new Error("bad plist");
    return id;
  },
  join: (a, b) => `${a}/${b}`,
});

const deps = (over: Partial<Parameters<typeof createInstalledApps>[0]>, clock = { t: 0 }): Parameters<typeof createInstalledApps>[0] => ({
  platform: "win32",
  windows: win({}, {}),
  mac: mac({}, {}),
  now: () => clock.t,
  ...over,
});

describe("installed apps on Windows", () => {
  const windows = win(
    {
      "P/Slack.lnk": "C:\\Users\\a\\AppData\\Local\\slack\\slack.exe",
      "P/Dev/Code.lnk": "C:/Program Files/Microsoft VS Code/Code.exe",
      "P/Store.lnk": "",
      "P/Docs.lnk": "C:\\x\\readme.txt",
      "P/Dev/Uninstall Code.lnk": "C:\\x\\unins000.exe",
      "P/A/B/C/D/E/Deep.lnk": "C:\\deep.exe",
    },
    {
      P: ["Slack.lnk", "Store.lnk", "Docs.lnk", "Dev", "A"],
      "P/Dev": ["Code.lnk", "Uninstall Code.lnk"],
      "P/A": ["B"],
      "P/A/B": ["C"],
      "P/A/B/C": ["D"],
      "P/A/B/C/D": ["E"],
      "P/A/B/C/D/E": ["Deep.lnk"],
    },
    ["P", "Gone"],
  );
  it("lists programs from shortcuts, skipping Store apps, non-programs, uninstallers, deep folders and unreadable roots", async () => {
    expect(await createInstalledApps(deps({ windows })).list()).toEqual({
      available: true,
      apps: [
        { key: "code", name: "Code" },
        { key: "slack", name: "Slack" },
      ],
    });
  });
});

describe("installed apps on Windows, large Start Menus", () => {
  const many = (n: number) => {
    const names = Array.from({ length: n }, (_, i) => `App${i}.lnk`);
    const links = Object.fromEntries(names.map((nm, i) => [`P/${nm}`, `C:/x/app${i}.exe`]));
    return { names, links };
  };
  it("pauses between batches of shortcut reads so the main thread is not held for the whole scan", async () => {
    const { names, links } = many(60);
    let pauses = 0;
    const host: WindowsHost = { ...win(links, { P: names }), pause: async () => void pauses++ };
    const result = await createInstalledApps(deps({ windows: host })).list();
    expect(result.apps).toHaveLength(60);
    expect(pauses).toBe(3);
  });
  it("reads at most 1500 shortcuts", async () => {
    const { names, links } = many(1600);
    const result = await createInstalledApps(deps({ windows: win(links, { P: names }) })).list();
    expect(result.apps).toHaveLength(1500);
  });
});

describe("installed apps on macOS", () => {
  const host = mac(
    { "/Applications/Safari.app": "com.apple.Safari", "/Applications/Suite/Pages.app": "com.apple.iWork.Pages", "/Applications/Broken.app": null },
    { "/Applications": ["Safari.app", "Suite", "Broken.app", "notes.txt", ".hidden"], "/Applications/Suite": ["Pages.app", "Deep"], "/Applications/Suite/Deep": ["Nope.app"] },
  );
  it("lists apps by bundle id, one folder deep, skipping apps without a readable plist", async () => {
    expect(await createInstalledApps(deps({ platform: "darwin", mac: host })).list()).toEqual({
      available: true,
      apps: [
        { key: "com.apple.iwork.pages", name: "Pages" },
        { key: "com.apple.safari", name: "Safari" },
      ],
    });
  });
  it("does not stop at an app whose plist throws", async () => {
    const h = mac({ "/Applications/A.app": "a.b" }, { "/Applications": ["A.app", "Bad.app"] });
    expect((await createInstalledApps(deps({ platform: "darwin", mac: h })).list()).apps).toEqual([{ key: "a.b", name: "A" }]);
  });
});

describe("the lazy list", () => {
  it("says not available on a system it cannot scan", async () => {
    expect(await createInstalledApps(deps({ platform: "linux" })).list()).toEqual({ apps: [], available: false });
  });
  it("scans once, shares a scan between two asks and reuses it until the time is up or a refresh is asked", async () => {
    let scans = 0;
    const clock = { t: 0 };
    const windows = win({ "P/A.lnk": "a.exe" }, { P: ["A.lnk"] });
    const counted: WindowsHost = { ...windows, list: (d) => (scans++, windows.list(d)) };
    const apps = createInstalledApps(deps({ windows: counted, ttlMs: 1000 }, clock));
    await Promise.all([apps.list(), apps.list()]);
    expect(scans).toBe(1);
    clock.t = 999;
    await apps.list();
    expect(scans).toBe(1);
    clock.t = 1000;
    await apps.list();
    expect(scans).toBe(2);
    await apps.list(true);
    expect(scans).toBe(3);
  });
  it("reports not available when the scan throws, and tries again on the next ask", async () => {
    let fail = true;
    const windows = win({ "P/A.lnk": "a.exe" }, { P: ["A.lnk"] });
    const flaky: WindowsHost = {
      ...windows,
      roots: () => {
        if (fail) throw new Error("no env");
        return ["P"];
      },
    };
    const apps = createInstalledApps(deps({ windows: flaky }));
    expect(await apps.list()).toEqual({ apps: [], available: false });
    fail = false;
    expect(await apps.list()).toEqual({ apps: [{ key: "a", name: "A" }], available: true });
  });
});

describe("a scan that hangs", () => {
  it("gives up after the deadline, reports not available and lets the next ask scan again", async () => {
    let hang = true;
    const windows = win({ "P/A.lnk": "a.exe" }, { P: ["A.lnk"] });
    const stuck: WindowsHost = { ...windows, list: (d) => (hang ? new Promise(() => {}) : windows.list(d)) };
    const apps = createInstalledApps(deps({ windows: stuck, scanTimeoutMs: 20 }));
    expect(await apps.list()).toEqual({ apps: [], available: false });
    hang = false;
    expect(await apps.list()).toEqual({ apps: [{ key: "a", name: "A" }], available: true });
  });
});

describe("a fixed list", () => {
  it("keeps the valid entries, merged and sorted", async () => {
    const json = JSON.stringify([{ key: "b", name: "Beta" }, { key: 1, name: "Bad" }, null, { key: "a", name: "Alpha" }]);
    expect(await fixedInstalledApps(json).list()).toEqual({
      available: true,
      apps: [
        { key: "a", name: "Alpha" },
        { key: "b", name: "Beta" },
      ],
    });
  });
  it("gives an empty available list for text that is not a list", async () => {
    expect(await fixedInstalledApps("nope").list()).toEqual({ available: true, apps: [] });
    expect(await fixedInstalledApps("{}").list()).toEqual({ available: true, apps: [] });
  });
});
