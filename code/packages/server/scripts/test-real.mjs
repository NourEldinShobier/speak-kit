// Runs the opt-in real-model suites of engine and server (downloads the model on first run).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let code = 0;
for (const pkg of ["../../engine", ".."]) {
  const cwd = fileURLToPath(new URL(pkg + "/", import.meta.url));
  const r = spawnSync("pnpm", ["exec", "vp", "test", "real"], {
    cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, SPEAKKIT_REAL: "1" },
  });
  code ||= r.status ?? 1;
}
process.exit(code);
