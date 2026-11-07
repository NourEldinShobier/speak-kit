import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const here = path.dirname(fileURLToPath(import.meta.url));
// Runs the generator with its one file write redirected to a temp file, so the committed icon-data.ts is only read.
const hook = `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const write = fs.writeFileSync;
fs.writeFileSync = (file, data) => write(String(file).endsWith("icon-data.ts") ? process.env.ICON_OUT : file, data);
syncBuiltinESMExports();
`;

describe("icon-data.ts", () => {
  it("is what scripts/make-icons.mjs generates from the logo (run it after changing the logo)", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "speakkit-icons-"));
    try {
      const out = path.join(tmp, "icon-data.ts");
      writeFileSync(path.join(tmp, "hook.mjs"), hook);
      execFileSync(process.execPath, ["--import", pathToFileURL(path.join(tmp, "hook.mjs")).href, path.join(here, "../../scripts/make-icons.mjs")], {
        env: { ...process.env, ICON_OUT: out },
        stdio: "pipe",
      });
      const lf = (file: string) => readFileSync(file, "utf8").replaceAll("\r\n", "\n");
      expect(lf(path.join(here, "icon-data.ts"))).toBe(lf(out));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    // 1.5 s alone; the child process is CPU-bound and took 8 s inside the parallel root run (the root config has no desktop timeout).
  }, 30_000);
});
