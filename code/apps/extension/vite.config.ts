import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin } from "vite-plus";
import { contentAssets, listSources } from "./build/lumen-subset";

const root = dirname(fileURLToPath(import.meta.url));
const test = process.env.SPEAKKIT_TEST === "1";
const define = { __TEST__: JSON.stringify(test) };

/** Copies manifest.json and builds the content script as one classic (IIFE) file; MV3 content scripts cannot be modules. */
function extensionPlugin(): Plugin {
  let outDir = "";
  return {
    name: "speakkit-extension",
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    async closeBundle() {
      mkdirSync(outDir, { recursive: true });
      copyFileSync(resolve(root, "manifest.json"), resolve(outDir, "manifest.json"));
      const common = {
        configFile: false as const,
        root,
        publicDir: false as const,
        define,
        logLevel: "warn" as const,
        plugins: [contentAssets(() => listSources(resolve(root, "src")))],
      };
      // content.js: extraction, highlight and the controller, as one classic script (MV3 content scripts cannot be modules).
      await build({
        ...common,
        build: {
          outDir,
          emptyOutDir: false,
          minify: !test,
          sourcemap: test,
          lib: {
            entry: resolve(root, "src/app/content/index.ts"),
            formats: ["iife"],
            name: "SpeakKitContent",
            fileName: () => "content.js",
          },
        },
      });
      // content-ui.js: the Lumen kit builders, CSS, launcher, dock and reader. An ES module that content.js imports on first need.
      await build({
        ...common,
        build: {
          outDir,
          emptyOutDir: false,
          minify: !test,
          sourcemap: test,
          lib: {
            entry: resolve(root, "src/app/content/ui-entry.ts"),
            formats: ["es"],
            fileName: () => "content-ui.js",
          },
        },
      });
    },
  };
}

export default defineConfig({
  root,
  base: "./",
  plugins: [react(), extensionPlugin(), contentAssets(() => listSources(resolve(root, "src")))],
  define,
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome116",
    minify: !test,
    sourcemap: test,
    rollupOptions: {
      input: {
        background: resolve(root, "src/app/background/index.ts"),
        popup: resolve(root, "popup.html"),
        options: resolve(root, "options.html"),
        sidepanel: resolve(root, "sidepanel.html"),
        offscreen: resolve(root, "offscreen.html"),
      },
      output: {
        entryFileNames: (c) =>
          c.name === "background" ? "background.js" : "assets/[name]-[hash].js",
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
  },
});
