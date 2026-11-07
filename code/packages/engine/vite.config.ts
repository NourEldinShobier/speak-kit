import { defineConfig } from "vite-plus";

// `pnpm exec vp pack` emits dist/index.js and dist/worker.js. The worker is a separate file because it
// runs in a worker_thread; pass its location to KokoroEngine({ workerUrl }) when index.js is bundled elsewhere.
export default defineConfig({
  pack: {
    entry: { index: "src/index.ts", worker: "src/worker.ts" },
    format: "esm",
    platform: "node",
    clean: true,
    fixedExtension: false,
    // protocol is workspace TypeScript, so it is bundled; kokoro-js stays an external dependency.
    deps: { alwaysBundle: [/^@speakkit\//] },
  },
});
