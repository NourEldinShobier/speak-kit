// Every custom gate must fail on its known-bad fixture and pass on its good one (a gate that passes its canary is broken).
import fc from "fast-check";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { compareCounts } from "../check-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const run = (script, fixture, ...extra) => {
  const root = path.join(here, fixture);
  const r = spawnSync(process.execPath, [path.join(here, "..", script), "--root", root, ...extra.map((e) => (e.startsWith("@") ? path.join(root, e.slice(1)) : e))], { encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};

describe("check-css", () => {
  it("fails on a physical property without a marker", () => {
    const r = run("check-css.mjs", "css-bad");
    expect(r.status).toBe(1);
    expect(r.out).toContain("physical CSS in desktop physicalCss: 1 > baseline 0");
  });
  it("accepts logical properties and a marked physical one", () => {
    expect(run("check-css.mjs", "css-good").status).toBe(0);
  });
});

describe("check-network", () => {
  it("fails on a fetch and a host that are not in the allow-list", () => {
    const r = run("check-network.mjs", "network-bad");
    expect(r.status).toBe(1);
    expect(r.out).toContain("network call in not in the allow-list: packages/player/src/leak.ts");
    expect(r.out).toContain("external host not in the allow-list: tracker.example.net");
  });
  it("passes when both are listed", () => {
    expect(run("check-network.mjs", "network-good").status).toBe(0);
  });
});

describe("check-deps", () => {
  it("fails on a range, an unlisted tool, an unpinned run and a missing release age", () => {
    const r = run("check-deps.mjs", "deps-bad");
    expect(r.status).toBe(1);
    for (const text of ['left-pad "^1.3.0" is not an exact version', 'catalog unlisted-tool: "^2.0.0"', "minimumReleaseAge", "pnpm dlx knip", "left-pad is not named in docs/decisions"])
      expect(r.out).toContain(text);
  });
  it("passes on a pinned catalog entry that an ADR names", () => {
    expect(run("check-deps.mjs", "deps-good").status).toBe(0);
  });
});

describe("check-integrity", () => {
  it("fails on a new skipped test", () => {
    const r = run("check-integrity.mjs", "integrity-skip", "--base", "@nobase");
    expect(r.status).toBe(1);
    expect(r.out).toContain("desktop test integrity skipped: 1 > baseline 0");
  });
  it("fails on a new env-gated (runIf) test file", () => {
    const r = run("check-integrity.mjs", "integrity-gated", "--base", "@nobase");
    expect(r.status).toBe(1);
    expect(r.out).toContain("desktop test integrity gated: 1 > baseline 0");
  });
  it("fails on a raised budget", () => {
    const r = run("check-integrity.mjs", "integrity-budget", "--base", "@nobase");
    expect(r.status).toBe(1);
    expect(r.out).toContain("budget e2e/tests/perf.spec.ts#ms raised to 900 (contract 600)");
  });
  it("fails on a baseline above the base branch", () => {
    const r = run("check-integrity.mjs", "integrity-grew", "--base", "@base");
    expect(r.status).toBe(1);
    expect(r.out).toContain("desktop baseline lint.code.complexity grew from 3 to 5");
  });
  it("passes on a clean tree", () => {
    expect(run("check-integrity.mjs", "integrity-good", "--base", "@nobase").status).toBe(0);
  });
});

describe("check-ratchet", () => {
  it("fails when a count is above its baseline", () => {
    const r = run("check-ratchet.mjs", "ratchet-bad", "--lint-json", "@lint.json", "desktop");
    expect(r.status).toBe(1);
    expect(r.out).toContain("desktop lint code.complexity: 2 > baseline 1");
    expect(r.out).toContain("desktop patterns asAny: 1 > baseline 0");
  });
  it("fails when a baseline is above the real count", () => {
    const r = run("check-ratchet.mjs", "ratchet-stale", "--lint-json", "@lint.json", "desktop");
    expect(r.status).toBe(1);
    expect(r.out).toContain("baseline 2 is higher than the real count 1");
  });
  it("passes when counts equal the baseline and a commented catch is not a swallowed error", () => {
    expect(run("check-ratchet.mjs", "ratchet-good", "--lint-json", "@lint.json", "desktop").status).toBe(0);
  });
});

describe("compareCounts", () => {
  it("reports a problem exactly when the count differs, and calls an increase a regression", () => {
    fc.assert(
      fc.property(fc.nat(1000), fc.nat(1000), (was, now) => {
        const problems = compareCounts("x", { k: was }, { k: now });
        expect(problems.length).toBe(was === now ? 0 : 1);
        if (now > was) expect(problems[0]).toContain(`${now} > baseline ${was}`);
      }),
    );
  });
});
