import { defineConfig } from "vite-plus";

// Stryker for the pure settings and app-surface modules. Keep `include` in step with `mutate` in stryker.surface.config.json.
export default defineConfig({
  define: { __TEST__: "false", __TEST_CODE__: "true" },
  test: {
    testTimeout: 20_000,
    include: [
      "apps/desktop/src/shared/settings/{external-edit,resources,import}.test.ts",
      "apps/desktop/src/shared/i18n/i18n.test.ts",
      "apps/desktop/src/main/settings-change.test.ts",
      "apps/desktop/src/shared/{release-notes,tray-notices}.test.ts",
      "apps/desktop/src/main/{resources,single-instance,window-size-guard,window-motion}.test.ts",
    ],
  },
});
