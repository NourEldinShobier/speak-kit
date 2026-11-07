import { defineConfig } from "vite-plus";

// `pnpm exec vp pack` emits dist/index.js (createServer), dist/cli.js (standalone server) and dist/worker.js
// (the Kokoro worker thread, a separate file because it runs in a worker_thread).
// Workspace packages and valibot are bundled; kokoro-js (and onnxruntime) stay external and must be
// resolvable from dist/worker.js, i.e. installed in the packaged app's node_modules.
// To use a worker at another location pass KokoroEngine({ workerUrl }) or set env SPEAKKIT_WORKER_URL for the CLI.
export default defineConfig({
  pack: {
    entry: { index: "src/index.ts", cli: "src/cli.ts", worker: "../engine/src/worker.ts" },
    format: "esm",
    platform: "node",
    clean: true,
    fixedExtension: false,
    deps: {
      alwaysBundle: [/^@speakkit\//, "valibot"],
      neverBundle: ["kokoro-js", /^@huggingface\//, "onnxruntime-node"],
    },
  },
});
