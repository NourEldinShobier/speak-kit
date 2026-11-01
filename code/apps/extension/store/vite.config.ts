import { defineConfig } from "vite-plus";

// Run with: pnpm exec vp test run --config store/vite.config.ts (from apps/extension). Not part of `pnpm test`: it starts Chromium.
export default defineConfig({
  define: { __TEST__: "false" },
  test: { include: ["store/capture.store.mjs"], environment: "node", testTimeout: 600_000, hookTimeout: 120_000 },
});
