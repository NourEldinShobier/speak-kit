import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/
/g, "
");
const jobOf = (yml, name) => {
  const m = yml.match(new RegExp(`^  ${name}:\n([\s\S]*?)(?=^  \S|(?![\s\S]))`, "m"));
  return m ? m[1] : "";
};

describe("CI desktop job", () => {
  const job = jobOf(read("../../.github/workflows/ci.yml"), "desktop");

  it("runs the desktop suite on Windows without a path filter, so the first-run wizard spec is included", () => {
    expect(job).toContain("runs-on: windows-latest");
    expect(job).toMatch(/run: pnpm --filter @speakkit\/desktop exec vp test run\s*$/m);
    expect(job).not.toContain("SPEAKKIT_SKIP_DESKTOP");
  });

  it("builds the app first, because the specs load dist", () => {
    expect(job.indexOf("exec vp build")).toBeGreaterThan(-1);
    expect(job.indexOf("exec vp build")).toBeLessThan(job.indexOf("vp test run"));
  });

  it("includes the spec files that drive the wizard", () => {
    expect(read("../apps/desktop/vite.config.ts")).toContain('"tests/**/*.test.ts"');
    expect(read("../apps/desktop/tests/smoke.test.ts")).toContain("first run: wizard");
    expect(read("../apps/desktop/tests/shell.test.ts")).toContain("first run opens the 960x680 setup window");
  });
});
