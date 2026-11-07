import { defineConfig } from "@playwright/test";

const full = process.env.E2E_FULL === "1";

export default defineConfig({
  testDir: "./tests",
  // Phase "perf" runs alone (see run.mjs) so its numbers are not distorted by parallel browsers.
  testMatch: process.env.E2E_PHASE === "perf" ? /perf.spec.ts/ : /.spec.ts/,
  ...(process.env.E2E_PHASE === "perf" ? {} : { testIgnore: /perf.spec.ts/ }),
  timeout: full ? 120_000 : 60_000,
  expect: { timeout: 8_000 },
  workers: Number(process.env.E2E_WORKERS ?? 3),
  // CI sets E2E_RETRIES: a shared 2-vCPU runner makes the timing-based specs (idle windows, hover delays) fail now and then; a retry that passes is listed as flaky.
  retries: Number(process.env.E2E_RETRIES ?? 0),
  reporter: [["list"], ["json", { outputFile: `results-${process.env.E2E_PHASE ?? "main"}.json` }]],
  ...(full ? {} : { grepInvert: /@slow/ }),
  use: { trace: "off" },
});
