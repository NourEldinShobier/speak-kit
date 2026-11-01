// Lets plain `node` run the workspace TypeScript sources, which use extensionless relative imports.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(spec, ctx, next) {
    if (
      /^\.\.?\//.test(spec) &&
      !/\.[cm]?[jt]s$|\.json$/.test(spec) &&
      ctx.parentURL?.startsWith("file:")
    ) {
      for (const ext of [".ts", "/index.ts"]) {
        const u = new URL(spec + ext, ctx.parentURL);
        if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
      }
    }
    return next(spec, ctx);
  },
});
