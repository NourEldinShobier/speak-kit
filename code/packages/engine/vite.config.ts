import { defineConfig } from "vite-plus";

// `pnpm exec vp pack` emits dist/index.js, dist/worker.js and dist/stt-worker.js. The workers are separate files because they
// run in their own thread or process; pass the location to KokoroEngine({ workerUrl }) or WhisperStt({ workerUrl }) when index.js is bundled elsewhere.
export default defineConfig({
  pack: {
    entry: { index: "src/index.ts", worker: "src/worker.ts", "stt-worker": "src/stt/worker.ts" },
    format: "esm",
    platform: "node",
    clean: true,
    fixedExtension: false,
    // protocol is workspace TypeScript, so it is bundled; kokoro-js stays an external dependency.
    deps: { alwaysBundle: [/^@speakkit\//] },
  },
});
