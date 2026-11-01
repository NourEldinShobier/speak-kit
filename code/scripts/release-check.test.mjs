import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { buildRun, readTests, verifyRun } from "./release-check.mjs";

const report = {
  suites: [
    {
      title: "perf.spec.ts",
      file: "perf.spec.ts",
      specs: [],
      suites: [
        {
          title: "performance budgets",
          specs: [
            { title: "popup open", tests: [{ status: "expected", results: [{ duration: 120 }] }] },
            { title: "flaky one", tests: [{ status: "flaky", results: [{ duration: 10 }, { duration: 20 }] }] },
            { title: "too slow", tests: [{ status: "unexpected", results: [{ duration: 5 }] }] },
          ],
        },
      ],
    },
  ],
};

describe("release-check", () => {
  it("flattens a Playwright report into final outcomes", () => {
    expect(readTests(report)).toEqual([
      { title: "performance budgets > popup open", status: "passed", ms: 120 },
      { title: "performance budgets > flaky one", status: "passed", ms: 30 },
      { title: "performance budgets > too slow", status: "failed", ms: 5 },
    ]);
  });

  it("passes only when every test passed", () => {
    const base = { version: "1.0.0", commit: "abc", dirty: false, complete: true, lines: ['{"name":"x","value":1,"unit":"ms","limit":"< 2"}', ""] };
    const ok = buildRun({ ...base, tests: [{ title: "a", status: "passed", ms: 1 }] });
    expect(ok.passed).toBe(true);
    expect(ok.measurements).toEqual([{ name: "x", value: 1, unit: "ms", limit: "< 2" }]);
    expect(buildRun({ ...base, tests: [{ title: "a", status: "failed", ms: 1 }] }).passed).toBe(false);
    expect(buildRun({ ...base, tests: [] }).passed).toBe(false);
  });

  it("accepts a complete, clean, passing run of a commit in the tagged history", () => {
    const run = { version: "1.0.0", commit: "abc", dirty: false, complete: true, passed: true };
    expect(verifyRun(run, "1.0.0", () => true)).toEqual([]);
  });

  it("names every reason a run is rejected", () => {
    expect(verifyRun(undefined, "1.0.0", () => true)).toEqual(['no perf run recorded for 1.0.0: run "pnpm run release:check" on the dev machine and commit docs/perf-runs/1.0.0.json']);
    const run = { version: "0.9.0", commit: "abc", dirty: true, complete: false, passed: false };
    expect(verifyRun(run, "1.0.0", () => false)).toEqual([
      "the file says version 0.9.0, not 1.0.0",
      "the run was partial (playwright arguments were passed)",
      "the run was made with uncommitted changes",
      "a perf test failed",
      "commit abc is not part of the tagged history",
    ]);
  });
});

describe("e2e/groups.json", () => {
  it("lists every spec file in exactly one group", () => {
    const groups = JSON.parse(readFileSync(new URL("../e2e/groups.json", import.meta.url), "utf8")).groups;
    const listed = Object.values(groups).flatMap((g) => g.specs);
    const onDisk = readdirSync(new URL("../e2e/tests/", import.meta.url)).filter((f) => f.endsWith(".spec.ts"));
    expect([...listed].sort()).toEqual([...onDisk].sort());
  });
});
