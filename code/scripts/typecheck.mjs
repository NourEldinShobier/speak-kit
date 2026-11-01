// Type-checks every workspace project with tsrs (the Rust port of TypeScript 7). CI runs this same script.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const code = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projects = ["packages", "apps"].flatMap((group) =>
  readdirSync(path.join(code, group))
    .map((d) => path.join(group, d))
    .filter((d) => existsSync(path.join(code, d, "tsconfig.json"))),
);
projects.push("e2e/tsconfig.check.json");

let failed = 0;
for (const p of projects) {
  const r = spawnSync("pnpm", ["exec", "tsrs", "--noEmit", "-p", p], { cwd: code, stdio: "inherit", shell: process.platform === "win32" });
  console.log(`${r.status ? "FAIL" : "ok  "} ${p}`);
  failed += r.status ? 1 : 0;
}
process.exit(failed ? 1 : 0);
