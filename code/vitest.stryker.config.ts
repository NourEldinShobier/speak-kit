import { defineConfig } from "vite-plus";

// Stryker runs one flat project: the root config has three projects and defines that its runner does not need.
// Keep `include` in step with `mutate` in stryker.config.json.
export default defineConfig({
  define: { __TEST__: "false", __TEST_CODE__: "true" },
  test: {
    testTimeout: 20_000,
    include: ["packages/dictation/tests/**/*.test.ts"],
  },
});
