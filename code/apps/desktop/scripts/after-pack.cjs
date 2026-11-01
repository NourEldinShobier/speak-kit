// electron-builder afterPack hook (see electron-builder.yml): for macOS, drop the native binaries of the other architecture from
// the app and give it an ad-hoc signature. Apple Silicon refuses to run code without a valid signature, and Electron's own
// signature breaks once the app is renamed and filled; a real Developer ID signature replaces this later (docs/releasing.md).
const { execFileSync } = require("node:child_process");
const { existsSync, readdirSync, rmSync } = require("node:fs");
const path = require("node:path");

const ARCHS = { 1: "x64", 3: "arm64" }; // electron-builder's Arch enum

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const { foreignMacArch } = await import("./stage-lib.mjs");
  const arch = ARCHS[context.arch];
  if (!arch) throw new Error(`unsupported macOS architecture ${context.arch}`);
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const modules = path.join(app, "Contents/Resources/app/node_modules");
  const other = arch === "arm64" ? "x64" : "arm64";

  rmSync(path.join(modules, "onnxruntime-node/bin/napi-v3/darwin", other), { recursive: true, force: true });
  for (const dir of [path.join(modules, "koffi/build/koffi"), path.join(modules, "@img")]) {
    if (existsSync(dir)) for (const d of readdirSync(dir)) if (foreignMacArch(d, arch)) rmSync(path.join(dir, d), { recursive: true, force: true });
  }

  // Loose native libraries are not covered by --deep: sign each before sealing the bundle.
  const natives = readdirSync(modules, { recursive: true }).filter((f) => /\.(node|dylib)$/.test(f));
  for (const f of natives) execFileSync("codesign", ["--force", "--sign", "-", path.join(modules, f)], { stdio: "inherit" });
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
};
