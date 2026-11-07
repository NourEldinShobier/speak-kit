import { build } from "vite-plus";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test-only code (the fake updater) is compiled in for `vp build`, which the Electron specs run, and removed when
 * SPEAKKIT_PACKAGE=1 (scripts/package.mjs) builds the bundle that ships.
 */
export const includeTestCode = () => process.env.SPEAKKIT_PACKAGE !== "1";

/** Node-side bundle (main, preload): workspace packages are inlined, electron and native addons stay external. */
export const nodeBuild = (entry: string, outDir: string, format: "es" | "cjs", file: string, { empty = true, testCode = includeTestCode() } = {}) =>
  build({
    root,
    configFile: false,
    logLevel: "warn",
    define: { __TEST_CODE__: JSON.stringify(testCode) },
    ssr: { noExternal: [/^@speakkit\//], target: "node" },
    build: {
      ssr: path.join(root, entry),
      outDir: path.isAbsolute(outDir) ? outDir : path.join(root, outDir),
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
