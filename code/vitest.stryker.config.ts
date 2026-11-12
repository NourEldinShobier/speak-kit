import { defineConfig } from "vite-plus";

// Stryker runs one flat project: the root config has three projects and defines that its runner does not need.
// Keep `include` in step with `mutate` in stryker.config.json.
export default defineConfig({
  define: { __TEST__: "false", __TEST_CODE__: "true" },
  test: {
    testTimeout: 20_000,
    include: [
      "packages/dictation/tests/**/*.test.ts",
      "packages/transcripts/tests/**/*.test.ts",
      "packages/meetings/tests/**/*.test.ts",
      "packages/engine/tests/{languages,download-error,transfers,device-hardware-idle,switching,model-files,stt-download-hosts,compare}.test.ts",
      "apps/desktop/src/main/speech-models/{view,hardware-probe,layout}.test.ts",
      "apps/desktop/src/main/{mic-owners,dictation/chord-tracker,dictation/chord-scenarios,dictation/keyboard-hook,dictation/pause-rules}.test.ts",
      "apps/desktop/src/main/dictation/macos/{macos,mouse-button}.test.ts",
      "packages/engine/tests/host-port.test.ts",
      "apps/desktop/src/renderer/speech-text.test.ts",
      "apps/desktop/src/renderer/features/wizard/dictation-step.test.ts",
      "apps/desktop/src/shared/dictation/sounds.test.ts",
      "apps/desktop/src/main/dictation/{hud-place,transform-typed,spool,spool-edge,spooled-recorder,fixture-recorder,fixture-recorder-edge,app-profile,program-version}.test.ts",
      "apps/desktop/src/main/dictation/ducking/*.test.ts",
    ],
  },
});
