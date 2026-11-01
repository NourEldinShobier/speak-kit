import { defineConfig } from "vite-plus";

// Playwright specs in e2e/ run with `pnpm run e2e`, not under vitest.
export default defineConfig({
  test: { exclude: ["**/node_modules/**", "**/dist/**", "**/dist-*/**", "e2e/**"] },
});
