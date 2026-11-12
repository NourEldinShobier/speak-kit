import { defineConfig } from "vite-plus";

// Stryker for the command-line, stream and page-context logic. Keep `include` in step with `mutate` in stryker.cli.config.json.
export default defineConfig({
  define: { __TEST__: "false", __TEST_CODE__: "true" },
  test: {
    testTimeout: 20_000,
    include: [
      "apps/desktop/src/cli/**/*.test.ts",
      "apps/desktop/src/main/cli-path/*.test.ts",
      "apps/desktop/src/shared/control/*.test.ts",
      "apps/desktop/src/renderer/features/settings/automation.test.tsx",
      "packages/server/src/streams/*.test.ts",
      "packages/server/tests/page-context.test.ts",
    ],
  },
});
