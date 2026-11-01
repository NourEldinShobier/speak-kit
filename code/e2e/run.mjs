// Builds the extension with the test hooks (SPEAKKIT_TEST=1) and runs Playwright. `--full` includes @slow tests (real model, desktop).
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const code = join(here, "..");
const args = process.argv.slice(2);
const full = args.includes("--full");
const rest = args.filter((a) => a !== "--full" && a !== "--no-build");
const env = { ...process.env, E2E_FULL: full ? "1" : "0" };

const sh = (cmd, a, opts) => spawnSync(cmd, a, { stdio: "inherit", shell: process.platform === "win32", ...opts });

if (!args.includes("--no-build")) {
  const b = sh("pnpm", ["exec", "vp", "build", "--outDir", process.env.E2E_DIST ?? "dist-e2e"], { cwd: join(code, "apps/extension"), env: { ...env, SPEAKKIT_TEST: "1" } });
  if (b.status) process.exit(b.status);
  if (full) {
    const d = sh("pnpm", ["exec", "vp", "build"], { cwd: join(code, "apps/desktop"), env });
    if (d.status) process.exit(d.status);
  }
}
const pw = join(here, "node_modules/@playwright/test/cli.js");
const run = (phase, extra = []) => spawnSync(process.execPath, [pw, "test", ...rest, ...extra], { stdio: "inherit", cwd: here, env: { ...env, E2E_PHASE: phase } });
const main = run("main");
const perf = rest.length ? { status: 0 } : run("perf", ["--workers=1"]);
process.exit(main.status || perf.status || 0);
