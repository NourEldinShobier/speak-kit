import { builtinModules } from "node:module";
import { defineConfig } from "vite-plus";

type Path = { name: string; message: string; allowTypeImports?: boolean };
type Pattern = ({ group: string[] } | { regex: string }) & { message: string };
const restrict = (...parts: { paths?: Path[]; patterns?: Pattern[] }[]) => ({
  "no-restricted-imports": ["error", { paths: parts.flatMap((p) => p.paths ?? []), patterns: parts.flatMap((p) => p.patterns ?? []) }],
});

const nodeMessage = "Node built-ins are not available here; this code runs in a browser, a service worker or a shared package.";
const noNode = { paths: builtinModules.filter((m) => !m.startsWith("_")).map((name) => ({ name, message: nodeMessage })), patterns: [{ group: ["node:*"], message: nodeMessage }] };
const noElectron = { paths: [{ name: "electron", message: "Electron is imported only under desktop main/ and preload/ (type imports are fine).", allowTypeImports: true }] };
const noMain = { patterns: [{ group: ["**/main/**"], message: "The renderer must not import from main/. Put shared contracts in src/shared/." }] };
const noDeepSibling = { patterns: [{ regex: String.raw`^\.\./[^./]+/[^/]+$`, message: "Import another feature through its index.ts." }] };
const noDeepFeature = { patterns: [{ group: ["**/features/*/*"], message: "Import a feature through its index.ts." }] };

const tests = ["**/*.test.{ts,tsx}", "**/*.spec.ts", "**/tests/**", "**/testing/**", "**/bench/**", "e2e/**", "packages/ui/gallery/**"];
const tooling = ["**/scripts/**", "**/cli.ts", "**/build/**", "**/store/**", "**/vite.config.ts", "**/node-build.ts"];

// Playwright specs in e2e/ run with `pnpm run e2e`, not under vitest.
const EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/dist-*/**", "e2e/**", "scripts/canary/*/**"];

export default defineConfig({
  // Matches the existing hand-written style: wide lines, double quotes, semicolons. Fixtures are test inputs and stay byte-exact.
  fmt: {
    printWidth: 200,
    ignorePatterns: [
      "**/fixtures/**",
      "**/spec/*.json",
      "pnpm-lock.yaml",
      "scripts/canary/*/**",
      "packages/ui/src/icon-data.ts",
      "packages/ui/src/tokens.ts",
      "packages/ui/src/logo-data.ts",
      "apps/desktop/src/main/icon-data.ts",
    ],
  },
  // Extension code reads __TEST__ and desktop main code reads __TEST_CODE__ (true outside a packaged build, as in apps/desktop/vite.config.ts); the packages define them for their own tests, the root run needs both.
  define: { __TEST__: "false", __TEST_CODE__: "true" },
  // The extension package runs its browser tests with 20 s; the root run has to allow the same when everything runs in parallel (the default is 5 s). Desktop specs set their own 60 s.
  // The desktop resource and event-loop budgets measure the whole machine, so that file runs alone, after every other file (group order 2), against the same budgets.
  test: {
    testTimeout: 20_000,
    projects: [
      { extends: true, test: { name: "main", exclude: [...EXCLUDE, "apps/desktop/tests/**"] } },
      // Every Electron spec starts whole apps; eleven at once starve each other (a window took over 30 s to appear), so three at a time.
      { extends: true, test: { name: "desktop", include: ["apps/desktop/tests/**/*.test.ts"], exclude: [...EXCLUDE, "apps/desktop/tests/perf.test.ts"], maxWorkers: 3, sequence: { groupOrder: 1 } } },
      {
        extends: true,
        test: {
          name: "perf",
          include: ["apps/desktop/tests/perf.test.ts"],
          exclude: EXCLUDE,
          fileParallelism: false,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
  lint: {
    ignorePatterns: ["scripts/canary/*/**"],
    plugins: ["typescript", "unicorn", "oxc", "react", "import", "node"],
    // Limits come from docs/engineering/ostio-practices.md (C3 to C7, U12, F8). Rules that still have violations are warnings
    // counted by scripts/check-ratchet.mjs; a rule whose baselines reached zero is an error.
    rules: {
      complexity: ["warn", { max: 15 }],
      "max-depth": ["warn", { max: 4 }],
      "max-params": ["warn", { max: 3 }],
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "no-nested-ternary": "warn",
      "no-else-return": "error",
      "no-lonely-if": "error",
      "react/rules-of-hooks": "error",
      "react/exhaustive-deps": "error",
      // React-Compiler style checks that the react plugin adds by default are not part of the limits; the hooks rules above are.
      "react/globals": "off",
      "react/refs": "off",
      "react/set-state-in-effect": "off",
      "react/purity": "off",
      "react/immutability": "off",
      "import/no-cycle": "error",
      "typescript/no-explicit-any": "warn",
      "typescript/ban-ts-comment": "error",
      "node/no-sync": "warn",
      "no-console": "warn",
    },
    overrides: [
      // The renderer talks to main only through window.speakkit and the wire contracts in src/shared.
      { files: ["apps/desktop/src/renderer/**"], rules: restrict(noMain, noElectron, noNode, noDeepFeature) },
      { files: ["apps/desktop/src/renderer/features/**"], rules: restrict(noMain, noElectron, noNode, noDeepSibling) },
      { files: ["apps/desktop/src/shared/**"], rules: restrict(noElectron) },
      // Another feature is imported only through its index.ts; the extension has no Electron or Node.
      { files: ["apps/extension/src/**"], rules: restrict(noElectron, noNode) },
      { files: ["apps/extension/src/app/**"], rules: restrict(noElectron, noNode, noDeepFeature) },
      { files: ["apps/extension/src/features/**"], rules: restrict(noElectron, noNode, noDeepSibling) },
      { files: ["packages/ui/src/**", "packages/player/src/**", "packages/protocol/src/**"], rules: restrict(noElectron, noNode) },
      // The global chrome object: extension app/, shared/ and one port file for settings.
      {
        files: ["apps/extension/src/features/**", "apps/extension/src/styles/**"],
        rules: { "no-restricted-globals": ["warn", { name: "chrome", message: "Use the chrome API only in extension app/ and shared/, or through features/settings/browser.ts." }] },
      },
      { files: ["apps/extension/src/features/settings/browser.ts"], rules: { "no-restricted-globals": "off" } },
      // The service worker has no log sink but its console; console.error is how it reports an exception (rule 12).
      { files: ["apps/extension/src/app/background/**"], rules: { "no-console": ["warn", { allow: ["error"] }] } },
      // The extension has no Node; oxlint takes CSSStyleSheet.replaceSync for a file API.
      { files: ["apps/extension/src/**"], rules: { "node/no-sync": "off" } },
      // Playwright fixtures call a function named use(); it is not a React hook.
      { files: ["e2e/**"], rules: { "react/rules-of-hooks": "off" } },
      {
        files: tests,
        rules: { "no-restricted-imports": "off", "no-restricted-globals": "off", "node/no-sync": "off", "no-console": "off", "max-lines-per-function": "off", "max-lines": "off", "max-params": "off" },
      },
      { files: tooling, rules: { "node/no-sync": "off", "no-console": "off", "no-restricted-imports": "off" } },
    ],
  },
});
