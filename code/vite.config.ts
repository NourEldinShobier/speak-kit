import { defineConfig } from "vite-plus";

const boundary = (group: string[], message: string) => ({ "no-restricted-imports": ["error", { patterns: [{ group, message }] }] });

// Playwright specs in e2e/ run with `pnpm run e2e`, not under vitest.
export default defineConfig({
  test: { exclude: ["**/node_modules/**", "**/dist/**", "**/dist-*/**", "e2e/**"] },
  lint: {
    overrides: [
      // The renderer talks to main only through window.speakkit and the wire contracts in src/shared.
      { files: ["apps/desktop/src/renderer/**"], rules: boundary(["**/main/**"], "The renderer must not import from main/. Put shared contracts in src/shared/.") },
      // Another feature is imported only through its index.ts.
      { files: ["apps/extension/src/app/**"], rules: boundary(["**/features/*/*"], "Import a feature through its index.ts.") },
    ],
  },
});
