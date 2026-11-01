import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const root = dirname(fileURLToPath(import.meta.url));

// Gallery (every component and state, dark and light). `vp build` writes static files to out/gallery.
export default defineConfig({
  root: resolve(root, "gallery"),
  base: "./",
  build: { outDir: resolve(root, "out/gallery"), emptyOutDir: true },
  test: { root, include: ["tests/**/*.test.{ts,tsx}"], testTimeout: 60_000 },
});
