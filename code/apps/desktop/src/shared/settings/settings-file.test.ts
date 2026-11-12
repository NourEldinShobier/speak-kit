import { describe, expect, it } from "vite-plus/test";
import { CONFIG_VERSION, invalidFieldsOf, loadSettings, noticeOf, noticeText, runMigrations } from "./settings-file";

describe("loading settings", () => {
  it("an empty file loads defaults with no notice and no backup", () => {
    const l = loadSettings({});
    expect(l.invalidFields).toEqual([]);
    expect(l.needsBackup).toBe(false);
    expect(noticeOf(l)).toBeNull();
    expect(l.config).toMatchObject({ appearance: "system", closeAction: "hide", hideTrayIcon: false, reduceMotion: "system", announce: true, soundVolume: 60, updateChannel: "stable", experiments: {}, configVersion: CONFIG_VERSION });
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
    expect(invalidFieldsOf({ soundVolume: 400, speed: 1 })).toEqual(["soundVolume"]);
    expect(loadSettings({ soundVolume: 400 }).config.soundVolume).toBe(60);
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
