import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  it("starts from defaults when there is no file", () => {
    const { config, path: file } = openConfig(dir);
    expect(file).toBe(path.join(dir, "config.json"));
    expect(config).toMatchObject({ setupDone: false, preferredPort: 47615, voice: "af_heart", speed: 1 });
  });

  it("repairs a hand-edited file field by field instead of failing", () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ setupDone: true, preferredPort: "high", speed: 1.5 }));
    expect(openConfig(dir).config).toMatchObject({ setupDone: true, preferredPort: 47615, speed: 1.5 });
  });

  it("saves changes so the next start sees them", () => {
    const c = openConfig(dir);
    c.config.setupDone = true;
    c.config.voice = "bf_emma";
    c.save();
    expect(onDisk()).toMatchObject({ setupDone: true, voice: "bf_emma" });
    expect(openConfig(dir).config).toMatchObject({ setupDone: true, voice: "bf_emma" });
  });

  it("lets SPEAKKIT_PORT override the port for this run without writing it to the file", () => {
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ preferredPort: 50000 }));
    vi.stubEnv("SPEAKKIT_PORT", "48123");
    const c = openConfig(dir);
    expect(c.config.preferredPort).toBe(48123);
    c.config.setupDone = true;
    c.save();
    expect(onDisk()).toMatchObject({ setupDone: true, preferredPort: 50000 });
  });
});
