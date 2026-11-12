import { defineConfig, type Plugin } from "vite-plus";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { includeTestCode, nodeBuild } from "./node-build";

const root = path.dirname(fileURLToPath(import.meta.url));

/** One `vp build` produces dist/renderer, dist/main and dist/preload. */
const electronProcesses = (): Plugin => ({
  name: "speakkit-electron-processes",
  apply: "build",
  async closeBundle() {
    await nodeBuild("src/main/index.ts", "dist/main", "es", "index.js");
    await nodeBuild("src/main/export/mp3-worker.ts", "dist/main", "es", "mp3-worker.js", { empty: false });
    await nodeBuild("src/main/library/parse/worker.ts", "dist/main", "es", "parse-worker.js", { empty: false });
    await nodeBuild("src/preload/index.ts", "dist/preload", "cjs", "index.cjs");
    // The command line and the MCP server: one file, run by the app own runtime in Node mode.
    await nodeBuild("src/cli/bin.ts", "dist/cli", "es", "speakkit.js");
  },
});

export default defineConfig({
  root: path.join(root, "src/renderer"),
  base: "./",
  define: { __TEST_CODE__: JSON.stringify(includeTestCode()) },
  plugins: [react(), electronProcesses()],
  build: {
    outDir: path.join(root, "dist/renderer"),
    emptyOutDir: true,
    target: "chrome140",
    // The app, the always-on-top mini player, the two dictation windows (the HUD pill and the hidden microphone page) and the three capture windows (capsule, picker and ink layer, hidden recorder).
    rollupOptions: {
      input: Object.fromEntries(
        ["index", "mini", "hud", "recorder", "capture-capsule", "capture-overlay", "capture-recorder", "decoder", "trecorder", "mrecorder", "meeting-capsule"].map((n) => [
          n,
          path.join(root, `src/renderer/${n}.html`),
        ]),
      ),
    },
  },
  test: {
    root,
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
