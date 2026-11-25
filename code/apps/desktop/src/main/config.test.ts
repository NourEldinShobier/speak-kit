import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { droppedNotices, openConfig } from "./config";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "speakkit-config-"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});
const onDisk = () => JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8"));

describe("openConfig", () => {
  it("sets a corrupt file aside as config.json.bad and starts from defaults", async () => {
    writeFileSync(path.join(dir, "config.json"), '{"setupDone": tru');
    const c = await openConfig(dir);
    expect(c.config).toMatchObject({ setupDone: false });
    expect(c.recovered).toBe(path.join(dir, "config.json.bad"));
    expect(readFileSync(path.join(dir, "config.json.bad"), "utf8")).toBe('{"setupDone": tru');
    c.config.setupDone = true;
    c.save();
    expect(onDisk()).toMatchObject({ setupDone: true });
  });

  it("reports nothing recovered for a healthy file", async () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ setupDone: true }));
    expect((await openConfig(dir)).recovered).toBeNull();
  });

  it("starts from defaults when there is no file", async () => {
    const { config, path: file } = await openConfig(dir);
    expect(file).toBe(path.join(dir, "config.json"));
    expect(config).toMatchObject({ setupDone: false, voice: "af_heart", speed: 1 });
  });

  it("repairs a hand-edited file field by field instead of failing", async () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ setupDone: true, speed: "fast" }));
    expect((await openConfig(dir)).config).toMatchObject({ setupDone: true, speed: 1 });
  });

  it("loads a config of an earlier version that uses a cloned voice and starts with the default voice, without an error", async () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ setupDone: true, voice: "cb_0a1b2c3d", speed: 1.5, engine: "chatterbox" }));
    const c = await openConfig(dir);
    expect(c.recovered).toBeNull();
    expect(c.config).toMatchObject({ setupDone: true, voice: "af_heart", speed: 1.5 });
  });

  it("saves changes so the next start sees them", async () => {
    const c = await openConfig(dir);
    c.config.setupDone = true;
    c.config.voice = "bf_emma";
    c.save();
    expect(onDisk()).toMatchObject({ setupDone: true, voice: "bf_emma" });
    expect((await openConfig(dir)).config).toMatchObject({ setupDone: true, voice: "bf_emma" });
  });

  it("loads a file that still has the removed port setting and gives it no effect", async () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ setupDone: true, preferredPort: 50000, speed: 1.5 }));
    const c = await openConfig(dir);
    expect(c.recovered).toBeNull();
    expect(c.config).toMatchObject({ setupDone: true, speed: 1.5 });
    expect(c.config).not.toHaveProperty("preferredPort");
  });
});

describe("settings repair and backup", () => {
  const raw = JSON.stringify({ setupDone: true, appearance: "neon", updateChannel: "early" });

  it("names the invalid field, keeps the others, and backs up the exact original bytes once before the first save", async () => {
    writeFileSync(path.join(dir, "config.json"), raw);
    const c = await openConfig(dir);
    expect(c.notice).toEqual({ kind: "repaired", fields: ["appearance"] });
    expect(c.config).toMatchObject({ appearance: "system", updateChannel: "early" });
    c.save();
    expect(readFileSync(path.join(dir, "config.backup.json"), "utf8")).toBe(raw);
    expect(onDisk()).toMatchObject({ appearance: "system", configVersion: 1 });
    writeFileSync(path.join(dir, "config.json"), "{}");
    c.save();
    expect(readFileSync(path.join(dir, "config.backup.json"), "utf8")).toBe(raw);
  });

  it("a healthy file is not backed up", async () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ setupDone: true }));
    const c = await openConfig(dir);
    expect(c.notice).toBeNull();
    c.save();
    expect(existsSync(path.join(dir, "config.backup.json"))).toBe(false);
  });

  it("a file from a newer app is read, flagged and never rewritten", async () => {
    const newer = JSON.stringify({ configVersion: 9, setupDone: true, speed: 2 });
    writeFileSync(path.join(dir, "config.json"), newer);
    const c = await openConfig(dir);
    expect(c.notice).toEqual({ kind: "newer", version: 9 });
    expect(c.config.speed).toBe(2);
    c.config.speed = 1;
    c.save();
    expect(readFileSync(path.join(dir, "config.json"), "utf8")).toBe(newer);
  });

  it("writes keys in alphabetical order", async () => {
    const c = await openConfig(dir);
    c.config.setupDone = true;
    c.save();
    const keys = Object.keys(onDisk());
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b, "en")));
    const nested = Object.keys(onDisk().dictation);
    expect(nested).toEqual([...nested].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("ignores capture keys left by an older version", async () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ setupDone: true, capture: { consent: true } }));
    const c = await openConfig(dir);
    expect(c.recovered).toBeNull();
    expect(c.config).toMatchObject({ setupDone: true });
    expect(c.config).not.toHaveProperty("capture");
  });

  it("loads a file that still has the removed automation settings and ignores them", async () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ setupDone: true, controlServer: false, mcpTools: { read_aloud: false, history_search: true } }));
    const c = await openConfig(dir);
    expect(c.recovered).toBeNull();
    expect(c.config).toMatchObject({ setupDone: true });
    expect(c.config).not.toHaveProperty("controlServer");
    expect(c.config).not.toHaveProperty("mcpTools");
  });
});

describe("the Activity line for entries that were left out", () => {
  it("names the old lists among the entries, and says how many entries and where the old file is", () => {
    expect(droppedNotices({ count: 0, copy: null })).toEqual([]);
    expect(droppedNotices({ count: 2, copy: "config.copy.json" })).toEqual([
      {
        title: "2 dictation entries could not be read",
        body: "Words, modes, replacements or corrections in Settings were broken, repeated or past the 500 words the list holds, and were left out. The old file is kept as config.copy.json.",
      },
    ]);
    expect(droppedNotices({ count: 1, copy: null })[0]?.title).toBe("1 dictation entry could not be read");
  });
});
