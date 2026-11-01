import { defineConfig } from "vite-plus";

const boundary = (group: string[], message: string) => ({ "no-restricted-imports": ["error", { patterns: [{ group, message }] }] });

// Playwright specs in e2e/ run with `pnpm run e2e`, not under vitest.
export default defineConfig({
  // Matches the existing hand-written style: wide lines, double quotes, semicolons. Fixtures are test inputs and stay byte-exact.
  fmt: { printWidth: 200, ignorePatterns: ["**/fixtures/**", "**/spec/*.json", "pnpm-lock.yaml", "packages/ui/src/icon-data.ts", "packages/ui/src/tokens.ts"] },
  // Extension code reads this build flag; the extension package defines it for its own tests, the root run needs it too.
  define: { __TEST__: "false" },
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
