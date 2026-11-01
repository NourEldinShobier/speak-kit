import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
// @ts-expect-error plain .mjs shared with scripts/size-report.mjs
import { measure, overBudget, pageAssets } from "../scripts/sizes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let dist = "";
let sizes: Record<string, number> = {};

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "speakkit-budget-"));
  const b = spawnSync("pnpm", ["exec", "vp", "build", "--outDir", dist], { cwd: root, shell: process.platform === "win32", encoding: "utf8", env: { ...process.env, NODE_ENV: "production", SPEAKKIT_TEST: "0", VITEST: "" } });
  if (b.status) throw new Error(`production build failed:\n${b.stdout}\n${b.stderr}`);
  sizes = measure(dist);
}, 180_000);
afterAll(() => rmSync(dist, { recursive: true, force: true, maxRetries: 3 }));

describe("bundle budgets (real gzip sizes of a production build)", () => {
  it("every bundle stays within its budget", () => {
    expect(overBudget(sizes)).toEqual([]);
  });

  it("the options page loads only General at start: the other sections are a lazy chunk", () => {
    const start = pageAssets(dist, "options").js.join(" ");
    expect(start).not.toMatch(/Sections/);
  });

  it("the in-page script stays a small bootstrap: content.js under 16 KB gzip", () => {
    expect(sizes["content.js"]).toBeLessThan(16 * 1024);
  });
});
