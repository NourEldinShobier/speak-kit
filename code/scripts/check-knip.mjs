// Runs knip (pinned in tools/knip, which has TypeScript 6 because knip 5 cannot load TypeScript 7) over the whole workspace.
import { spawnSync } from "node:child_process";
import { codeRoot } from "./check-lib.mjs";

const r = spawnSync("pnpm", ["--filter", "@speakkit/knip-runner", "exec", "knip", "--directory", codeRoot, "--no-progress"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
