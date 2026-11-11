import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vite-plus/test";
import { build } from "vite-plus";
import { nodeBuild } from "../node-build";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(path.join(tmpdir(), "speakkit-bundle-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));
const bundle = async (name: string, testCode: boolean) => {
  await nodeBuild("src/main/index.ts", path.join(out, name), "es", "index.js", { testCode });
  return readFileSync(path.join(out, name, "index.js"), "utf8");
};

describe("main bundle", () => {
  it("contains the fake updater in the test build and not in the packaged one", async () => {
    expect(await bundle("test", true)).toContain("function fakeUpdater");
    const shipped = await bundle("shipped", false);
    expect(shipped).not.toContain("fakeUpdater");
    expect(shipped).not.toContain('emit("update-available"');
  });
});

describe("renderer bundle", () => {
  it("has the sleep-timer test shortcut in the test build and not in the shipped one", async () => {
    const key = "speakkit.test.msPerMinute";
    const read = async (name: string, testCode: boolean) => {
      const dir = path.join(out, name);
      vi.stubEnv("NODE_ENV", "production");
      await build({
        configFile: path.join(appDir, "vite.config.ts"),
        logLevel: "warn",
        mode: "production",
        define: { __TEST_CODE__: JSON.stringify(testCode) },
        build: { outDir: dir, emptyOutDir: true },
      }).finally(() => vi.unstubAllEnvs());
      return readdirSync(path.join(dir, "assets"))
        .filter((f) => f.endsWith(".js"))
        .map((f) => readFileSync(path.join(dir, "assets", f), "utf8"))
        .join("");
    };
    expect(await read("renderer-test", true)).toContain(key);
    expect(await read("renderer-shipped", false)).not.toContain(key);
  }, 180_000);
});

/**
 * Gzip bytes of what a window loads up front: its script, the chunks it preloads and its stylesheets (the lazy PDF, OCR, dictation and worker chunks are not counted). Current size plus 10 %.
 * index: 185,500 to 191,000 for dictation's entry in Settings, its config schema and the shared-chunk split of its lazy page (3.2 KB; main was already 1.4 KB over).
 */
const RENDERER_BUDGET_BYTES = { index: 191_000, mini: 133_000 };

describe("renderer bundles", () => {
  it.each(Object.entries(RENDERER_BUDGET_BYTES))(
    "%s.html loads under %i gzip bytes",
    async (entry, budget) => {
      const renderer = path.join(out, "renderer");
      if (!existsSync(renderer)) {
        vi.stubEnv("NODE_ENV", "production"); // vitest sets "test", which would build React's development bundle
        await build({ configFile: path.join(appDir, "vite.config.ts"), logLevel: "warn", mode: "production", build: { outDir: renderer, emptyOutDir: true } }).finally(() => vi.unstubAllEnvs());
      }
      const html = readFileSync(path.join(renderer, `${entry}.html`), "utf8");
      const files = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]!);
      expect(files.length).toBeGreaterThan(1);
      const bytes = files.reduce((sum, f) => sum + gzipSync(readFileSync(path.join(renderer, f)), { level: 9 }).length, 0);
      expect(bytes).toBeLessThan(budget);
    },
    120_000,
  );
});
