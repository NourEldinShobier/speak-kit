import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Real update on Windows: older installer -> local feed -> "Install when I quit" and "Restart now", checked through /v1/health.
 * Slow (two packaging builds on a cold run, several installs) and it touches the registry briefly, so it only runs when
 * SPEAKKIT_UPDATE_E2E=1 is set: `SPEAKKIT_UPDATE_E2E=1 pnpm exec vp test run tests/update-e2e.test.ts`. The steps are in
 * scripts/update-e2e/run.mjs; docs/auto-update.md describes them.
 */
describe.skipIf(process.env.SPEAKKIT_UPDATE_E2E !== "1" || process.platform !== "win32")("auto update of the installed Windows build (slow)", () => {
  it(
    "downloads from the local feed and installs on quit and on Restart now",
    () => {
      const run = spawnSync(process.execPath, [path.join(appDir, "scripts/update-e2e/run.mjs")], { cwd: appDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      process.stdout.write(run.stdout);
      process.stderr.write(run.stderr);
      expect(run.stdout).toContain("UPDATE E2E PASSED");
      expect(run.status).toBe(0);
    },
    45 * 60_000,
  );
});
