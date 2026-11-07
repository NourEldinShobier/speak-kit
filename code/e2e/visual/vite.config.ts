import { defineConfig } from "vite-plus";

export default defineConfig({
  test: { include: ["*.test.ts"], environment: "node", testTimeout: 600_000, hookTimeout: 120_000, fileParallelism: false },
});
