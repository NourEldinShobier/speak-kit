import { build, defineConfig, type Plugin } from "vite-plus";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Node-side bundle (main, preload): workspace packages are inlined, electron and native addons stay external. */
const nodeBuild = (entry: string, outDir: string, format: "es" | "cjs", file: string, empty = true) =>
  build({
    root,
    configFile: false,
    logLevel: "warn",
    ssr: { noExternal: [/^@speakkit\//], target: "node" },
    build: {
      ssr: path.join(root, entry),
      outDir: path.join(root, outDir),
      emptyOutDir: empty,
      target: "node24",
      minify: false,
      sourcemap: false,
      rollupOptions: {
        external: ["electron", "onnxruntime-node", "sharp"],
        output: { format, entryFileNames: file },
      },
    },
  });

/** One `vp build` produces dist/renderer, dist/main and dist/preload. */
const electronProcesses = (): Plugin => ({
  name: "speakkit-electron-processes",
  apply: "build",
  async closeBundle() {
    await nodeBuild("src/main/index.ts", "dist/main", "es", "index.js");
    await nodeBuild("src/main/export/mp3-worker.ts", "dist/main", "es", "mp3-worker.js", false);
    await nodeBuild("src/preload/index.ts", "dist/preload", "cjs", "index.cjs");
  },
});

export default defineConfig({
  root: path.join(root, "src/renderer"),
  base: "./",
  plugins: [react(), electronProcesses()],
  build: {
    outDir: path.join(root, "dist/renderer"),
    emptyOutDir: true,
    target: "chrome140",
    // Three windows: the app, the always-on-top mini player and the tray panel.
    rollupOptions: {
      input: Object.fromEntries(["index", "mini", "panel"].map((n) => [n, path.join(root, `src/renderer/${n}.html`)])),
    },
  },
  test: {
    root,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
