import { defineConfig } from "@playwright/test";

const full = process.env.E2E_FULL === "1";

export default defineConfig({
  testDir: "./tests",
  // Phase "perf" runs alone (see run.mjs) so its numbers are not distorted by parallel browsers.
  testMatch: process.env.E2E_PHASE === "perf" ? /perf.spec.ts/ : /.spec.ts/,
  testIgnore: process.env.E2E_PHASE === "perf" ? undefined : /perf.spec.ts/,
  timeout: full ? 120_000 : 60_000,
  expect: { timeout: 8_000 },
  workers: Number(process.env.E2E_WORKERS ?? 3),
  retries: 0,
  reporter: [["list"], ["json", { outputFile: `results-${process.env.E2E_PHASE ?? "main"}.json` }]],
  grepInvert: full ? undefined : /@slow/,
  use: { trace: "off" },
});
