// Release gate. Runs the perf phase of the e2e suite on the dev machine (absolute budgets need a quiet machine, so CI skips it)
// and writes docs/perf-runs/<version>.json with the commit sha; release.yml runs `--verify` and fails when that file is missing or not valid.
//   node scripts/release-check.mjs [--version X.Y.Z] [--allow-dirty] [--out <dir>] [-- <playwright args>]
//   node scripts/release-check.mjs --verify <X.Y.Z> [--ref <git ref>]
// A run with playwright args (for example --grep) is partial and never passes `--verify`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { codeRoot, runsAsMain } from "./check-lib.mjs";

const repoRoot = path.resolve(codeRoot, "..");
const e2eDir = path.join(codeRoot, "e2e");
const resultsJson = path.join(e2eDir, "results-perf.json");
const measurements = path.join(e2eDir, "perf-results.jsonl");
const git = (...args) => spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });

const runFile = (dir, version) => path.join(dir, `${version}.json`);

/** Tests of a Playwright JSON report as { title, status, ms }, where status is the final outcome. */
export function readTests(report) {
  const out = [];
  const visit = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      const tests = spec.tests ?? [];
      const status = tests.every((t) => t.status === "expected" || t.status === "flaky") ? "passed" : "failed";
      const ms = tests.flatMap((t) => t.results ?? []).reduce((sum, r) => sum + (r.duration ?? 0), 0);
      out.push({ title: [...titles, spec.title].join(" > "), status, ms });
    }
    for (const child of suite.suites ?? []) visit(child, [...titles, child.title]);
  };
  for (const suite of report.suites ?? []) visit(suite, suite.file ? [] : [suite.title]);
  return out;
}

export function buildRun({ version, commit, dirty, complete, tests, lines }) {
  return {
    version,
    commit,
    dirty,
    complete,
    passed: tests.length > 0 && tests.every((t) => t.status === "passed"),
    date: new Date().toISOString(),
    machine: { platform: process.platform, arch: process.arch, cpus: os.cpus().length, node: process.version },
    tests,
    measurements: lines.filter(Boolean).map((l) => JSON.parse(l)),
  };
}

/** Problems with a recorded run for `version`; empty when the release may go ahead. `isAncestor(commit)` asks git. */
export function verifyRun(run, version, isAncestor) {
  if (!run) return [`no perf run recorded for ${version}: run "pnpm run release:check" on the dev machine and commit docs/perf-runs/${version}.json`];
  const problems = [];
  if (run.version !== version) problems.push(`the file says version ${run.version}, not ${version}`);
  if (run.complete !== true) problems.push("the run was partial (playwright arguments were passed)");
  if (run.dirty !== false) problems.push("the run was made with uncommitted changes");
  if (run.passed !== true) problems.push("a perf test failed");
  if (!run.commit || !isAncestor(run.commit)) problems.push(`commit ${run.commit} is not part of the tagged history`);
  return problems;
}

function check() {
  const argv = process.argv.slice(2);
  const split = argv.indexOf("--");
  const own = split < 0 ? argv : argv.slice(0, split);
  const extra = split < 0 ? [] : argv.slice(split + 1);
  const value = (name) => own[own.indexOf(name) + 1];
  const dir = own.includes("--out") ? path.resolve(value("--out")) : path.join(repoRoot, "docs", "perf-runs");
  const pkg = JSON.parse(readFileSync(path.join(codeRoot, "apps/desktop/package.json"), "utf8"));
  const version = own.includes("--version") ? value("--version") : pkg.version;
  const dirty = git("status", "--porcelain", "--untracked-files=no").stdout.trim() !== "";
  if (dirty && !own.includes("--allow-dirty")) {
    console.error("release-check: the working tree has uncommitted changes; commit them first (or --allow-dirty for a dry run, which --verify rejects)");
    return 1;
  }
  rmSync(resultsJson, { force: true });
  rmSync(measurements, { force: true });
  const run = spawnSync(process.execPath, [path.join(e2eDir, "run.mjs"), "--phase=perf", ...extra], { stdio: "inherit", cwd: codeRoot });
  if (!existsSync(resultsJson)) {
    console.error("release-check: the perf phase wrote no report");
    return run.status || 1;
  }
  const record = buildRun({
    version,
    commit: git("rev-parse", "HEAD").stdout.trim(),
    dirty,
    complete: extra.length === 0,
    tests: readTests(JSON.parse(readFileSync(resultsJson, "utf8"))),
    lines: existsSync(measurements) ? readFileSync(measurements, "utf8").split("\n") : [],
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(runFile(dir, version), JSON.stringify(record, null, 2) + "\n");
  console.log(`release-check: ${record.passed ? "passed" : "FAILED"}; wrote ${path.relative(process.cwd(), runFile(dir, version))}`);
  return record.passed ? 0 : 1;
}

function verify() {
  const argv = process.argv.slice(2);
  const version = argv[argv.indexOf("--verify") + 1];
  const ref = argv.includes("--ref") ? argv[argv.indexOf("--ref") + 1] : "HEAD";
  const file = runFile(path.join(repoRoot, "docs", "perf-runs"), version);
  const run = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
  const problems = verifyRun(run, version, (commit) => git("merge-base", "--is-ancestor", commit, ref).status === 0);
  for (const p of problems) console.error(`release-check: ${p}`);
  if (!problems.length) console.log(`release-check: docs/perf-runs/${version}.json is valid (commit ${run.commit.slice(0, 7)})`);
  return problems.length ? 1 : 0;
}

if (runsAsMain(import.meta.url)) process.exit(process.argv.includes("--verify") ? verify() : check());
