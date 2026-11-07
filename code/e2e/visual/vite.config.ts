import { defineConfig } from "vite-plus";

export default defineConfig({
  test: { include: process.env.FLOWS ? ["*.test.ts", "*.capture.ts"] : ["*.test.ts"], environment: "node", testTimeout: 600_000, hookTimeout: 120_000, fileParallelism: false },
});
