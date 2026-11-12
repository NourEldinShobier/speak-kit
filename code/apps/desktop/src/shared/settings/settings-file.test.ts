import { describe, expect, it } from "vite-plus/test";
import { CONFIG_VERSION, invalidFieldsOf, loadSettings, noticeOf, noticeText, runMigrations } from "./settings-file";

describe("loading settings", () => {
  it("an empty file loads defaults with no notice and no backup", () => {
    const l = loadSettings({});
    expect(l.invalidFields).toEqual([]);
    expect(l.needsBackup).toBe(false);
    expect(noticeOf(l)).toBeNull();
    expect(l.config).toMatchObject({
      appearance: "system",
      closeAction: "hide",
      hideTrayIcon: false,
      reduceMotion: "system",
      updateChannel: "stable",
      experiments: {},
      configVersion: CONFIG_VERSION,
    });
  });

  it("an invalid field loads as its default, is named, and asks for a backup", () => {
    const l = loadSettings({ idleUnload: "42", closeAction: "explode", autoUpdate: false });
    expect(l.config.idleUnload).toBe("5");
    expect(l.config.closeAction).toBe("hide");
    expect(l.config.autoUpdate).toBe(false);
    expect(l.invalidFields).toEqual(["closeAction", "idleUnload"]);
    expect(l.needsBackup).toBe(true);
    expect(noticeOf(l)).toEqual({ kind: "repaired", fields: ["closeAction", "idleUnload"] });
  });

  it("a number outside its range counts as invalid", () => {
    expect(invalidFieldsOf({ speed: 9, preferredPort: 70000 })).toEqual(["preferredPort", "speed"]);
    expect(loadSettings({ speed: 9 }).config.speed).toBe(1);
  });

  it("a file from a newer app loads read-only with a notice and no backup", () => {
    const l = loadSettings({ configVersion: CONFIG_VERSION + 4, autoUpdate: false });
    expect(l.newerVersion).toBe(CONFIG_VERSION + 4);
    expect(l.needsBackup).toBe(false);
    expect(l.config.autoUpdate).toBe(false);
    expect(noticeOf(l)).toEqual({ kind: "newer", version: CONFIG_VERSION + 4 });
    expect(noticeText(noticeOf(l)!)).toContain("newer version");
  });

  it("garbage on disk loads defaults", () => {
    for (const x of [null, "text", 7, [1, 2]]) expect(loadSettings(x).config.autoUpdate).toBe(true);
  });

  it("the notice lists at most four fields", () => {
    const text = noticeText({ kind: "repaired", fields: ["a", "b", "c", "d", "e", "f"] });
    expect(text).toContain("a, b, c, d and 2 more");
  });
});

describe("one-time migrations", () => {
  const list = [
    { id: "m1", run: (r: Record<string, unknown>) => ({ ...r, speed: 2 }) },
    { id: "m2", run: (r: Record<string, unknown>) => ({ ...r, voice: "bf_emma" }) },
  ];

  it("runs each migration once and records its id", () => {
    const first = runMigrations({}, [], list);
    expect(first).toEqual({ raw: { speed: 2, voice: "bf_emma" }, applied: ["m1", "m2"] });
    const second = runMigrations({ speed: 1 }, first.applied, list);
    expect(second).toEqual({ raw: { speed: 1 }, applied: ["m1", "m2"] });
  });

  it("runs only the ones not yet applied and marks the file for a backup", () => {
    const l = loadSettings({ appliedMigrations: ["m1"], speed: 1 }, list);
    expect(l.config.voice).toBe("bf_emma");
    expect(l.config.speed).toBe(1);
    expect(l.config.appliedMigrations).toEqual(["m1", "m2"]);
    expect(l.needsBackup).toBe(true);
  });

  it("a newer file is not migrated", () => {
    const l = loadSettings({ configVersion: 99, appliedMigrations: [] }, list);
    expect(l.config.appliedMigrations).toEqual([]);
  });
});

describe("stored values of the wrong type", () => {
  it("a version that is not a number counts as version 1, not as newer", () => {
    expect(loadSettings({ configVersion: "9" }).newerVersion).toBeNull();
    expect(loadSettings({ configVersion: Number.POSITIVE_INFINITY }).newerVersion).toBeNull();
  });

  it("applied ids that are not strings are ignored", () => {
    const list = [{ id: "m1", run: (r: Record<string, unknown>) => ({ ...r, speed: 2 }) }];
    expect(loadSettings({ appliedMigrations: [5, null], speed: 1 }, list).config.speed).toBe(2);
    expect(loadSettings({ appliedMigrations: "m1", speed: 1 }, list).config.speed).toBe(2);
    expect(loadSettings({ appliedMigrations: ["m1", 5], speed: 1 }, list).config.speed).toBe(1);
  });

  it("the notice lists four fields without a tail and five with one", () => {
    expect(noticeText({ kind: "repaired", fields: ["a", "b", "c", "d"] })).toBe("Some saved settings were not valid and use their defaults: a, b, c, d. The original file is kept as a backup.");
    expect(noticeText({ kind: "repaired", fields: ["a", "b", "c", "d", "e"] })).toContain("a, b, c, d and 1 more");
  });
});
