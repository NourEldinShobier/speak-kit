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
      updateChannel: "stable",
      configVersion: CONFIG_VERSION,
    });
  });

  it("an invalid field loads as its default, is named, and asks for a backup", () => {
    const l = loadSettings({ appearance: "neon", updateChannel: "explode", language: "de" });
    expect(l.config.appearance).toBe("system");
    expect(l.config.updateChannel).toBe("stable");
    expect(l.config.language).toBe("de");
    expect(l.invalidFields).toEqual(["appearance", "updateChannel"]);
    expect(l.needsBackup).toBe(true);
    expect(noticeOf(l)).toEqual({ kind: "repaired", fields: ["appearance", "updateChannel"] });
  });

  it("a number outside its range counts as invalid", () => {
    expect(invalidFieldsOf({ speed: 9, voiceChatVoice: "nobody" })).toEqual(["speed", "voiceChatVoice"]);
    expect(loadSettings({ speed: 9 }).config.speed).toBe(1);
  });

  it("a file from a newer app loads read-only with a notice and no backup", () => {
    const l = loadSettings({ configVersion: CONFIG_VERSION + 4, appearance: "light" });
    expect(l.newerVersion).toBe(CONFIG_VERSION + 4);
    expect(l.needsBackup).toBe(false);
    expect(l.config.appearance).toBe("light");
    expect(noticeOf(l)).toEqual({ kind: "newer", version: CONFIG_VERSION + 4 });
    expect(noticeText(noticeOf(l)!)).toContain("newer version");
  });

  it("garbage on disk loads defaults", () => {
    for (const x of [null, "text", 7, [1, 2]]) expect(loadSettings(x).config.appearance).toBe("system");
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

describe("the migration that keeps the models loaded", () => {
  it.each([15, 5])("moves the old default of %i minutes to never, remembers it and asks for a backup", (minutes) => {
    const l = loadSettings({ engines: { idleMinutes: minutes, device: "gpu" } });
    expect(l.config.engines).toMatchObject({ idleMinutes: 0, device: "gpu" });
    expect(l.config.appliedMigrations).toEqual(["engines-models-stay-loaded"]);
    expect(l.needsBackup).toBe(true);
  });

  it("leaves every other choice alone, and a choice made after the migration ran", () => {
    expect(loadSettings({ engines: { idleMinutes: 60 } }).config.engines.idleMinutes).toBe(60);
    expect(loadSettings({ engines: { idleMinutes: 30 } }).config.engines.idleMinutes).toBe(30);
    expect(loadSettings({ engines: { idleMinutes: 15 }, appliedMigrations: ["engines-models-stay-loaded"] }).config.engines.idleMinutes).toBe(15);
  });

  it("a file without engines loads the default (never) without a backup", () => {
    const l = loadSettings({ appearance: "light" });
    expect(l.config.engines.idleMinutes).toBe(0);
    expect(l.needsBackup).toBe(false);
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

describe("the What is new notes", () => {
  it("a file from before them loads an empty one, a stored one is kept, a broken one is repaired", () => {
    expect(loadSettings({ appearance: "light" }).config.whatsNew).toEqual({ version: "", notes: [] });
    const kept = loadSettings({ whatsNew: { version: "0.4.0", notes: ["a"] } });
    expect(kept.config.whatsNew).toEqual({ version: "0.4.0", notes: ["a"] });
    expect(kept.needsBackup).toBe(false);
    expect(loadSettings({ whatsNew: { version: 7, notes: "x" } }).config.whatsNew).toEqual({ version: "", notes: [] });
  });
});
