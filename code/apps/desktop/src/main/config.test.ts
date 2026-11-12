import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { openConfig } from "./config";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "speakkit-config-"));
  vi.stubEnv("SPEAKKIT_PORT", "");
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
    expect(c.config).toMatchObject({ setupDone: false, preferredPort: 47615 });
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
    expect(config).toMatchObject({ setupDone: false, preferredPort: 47615, voice: "af_heart", speed: 1 });
  });

  it("repairs a hand-edited file field by field instead of failing", async () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ setupDone: true, preferredPort: "high", speed: 1.5 }));
    expect((await openConfig(dir)).config).toMatchObject({ setupDone: true, preferredPort: 47615, speed: 1.5 });
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

  it("lets SPEAKKIT_PORT override the port for this run without writing it to the file", async () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ preferredPort: 50000 }));
    vi.stubEnv("SPEAKKIT_PORT", "48123");
    const c = await openConfig(dir);
    expect(c.config.preferredPort).toBe(48123);
    c.config.setupDone = true;
    c.save();
    expect(onDisk()).toMatchObject({ setupDone: true, preferredPort: 50000 });
  });
});

describe("settings repair and backup", () => {
  const raw = JSON.stringify({ setupDone: true, idleUnload: "soon", closeAction: "quit" });

  it("names the invalid field, keeps the others, and backs up the exact original bytes once before the first save", async () => {
    writeFileSync(path.join(dir, "config.json"), raw);
    const c = await openConfig(dir);
    expect(c.notice).toEqual({ kind: "repaired", fields: ["idleUnload"] });
    expect(c.config).toMatchObject({ idleUnload: "5", closeAction: "quit" });
    c.save();
    expect(readFileSync(path.join(dir, "config.backup.json"), "utf8")).toBe(raw);
    expect(onDisk()).toMatchObject({ idleUnload: "5", configVersion: 1 });
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
});
