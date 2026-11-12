import { defineConfig } from "vite-plus";

// Stryker for the pure capture modules. Keep `include` in step with `mutate` in stryker.capture.config.json.
export default defineConfig({
  define: { __TEST__: "false", __TEST_CODE__: "true" },
  test: {
    testTimeout: 20_000,
    include: ["apps/desktop/src/main/capture/**/*.test.ts", "apps/desktop/src/shared/capture/**/*.test.ts", "apps/desktop/src/renderer/features/capture/*.test.ts"],
    exclude: ["apps/desktop/src/main/capture/platform/**"],
  },
});
