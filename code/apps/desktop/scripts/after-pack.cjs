// electron-builder afterPack hook (see electron-builder.yml): sets the Electron fuses (docs/decisions/0004-electron-fuses-runasnode.md), then, for macOS, drop the native binaries of the other architecture from
// the app and give it an ad-hoc signature. Apple Silicon refuses to run code without a valid signature, and Electron's own
// signature breaks once the app is renamed and filled; a real Developer ID signature replaces this later (docs/releasing.md).
const { execFileSync } = require("node:child_process");
const { existsSync, readdirSync, rmSync } = require("node:fs");
const path = require("node:path");

const ARCHS = { 1: "x64", 3: "arm64" }; // electron-builder's Arch enum

// Flipped here rather than through electron-builder's electronFuses option: that option runs after this hook, and changing the
// binary after the ad-hoc signature below would invalidate it. RunAsNode stays on: the model host starts with child_process.fork.
async function setFuses(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = await import("@electron/fuses");
  const mac = context.electronPlatformName === "darwin";
  const { productFilename } = context.packager.appInfo;
  await flipFuses(path.join(context.appOutDir, mac ? `${productFilename}.app` : `${productFilename}.exe`), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
  });
}

exports.default = async function afterPack(context) {
  await setFuses(context);
  if (context.electronPlatformName !== "darwin") return;
  const { foreignMacArch } = await import("./stage-lib.mjs");
  const arch = ARCHS[context.arch];
  if (!arch) throw new Error(`unsupported macOS architecture ${context.arch}`);
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const modules = path.join(app, "Contents/Resources/app/node_modules");
  const other = arch === "arm64" ? "x64" : "arm64";

  rmSync(path.join(modules, "onnxruntime-node/bin/napi-v3/darwin", other), { recursive: true, force: true });
  for (const dir of [path.join(modules, "@koromix"), path.join(modules, "@img")]) {
    if (existsSync(dir)) for (const d of readdirSync(dir)) if (foreignMacArch(d, arch)) rmSync(path.join(dir, d), { recursive: true, force: true });
  }

  // Loose native libraries are not covered by --deep: sign each before sealing the bundle.
  const natives = readdirSync(modules, { recursive: true }).filter((f) => /\.(node|dylib)$/.test(f));
  for (const f of natives) execFileSync("codesign", ["--force", "--sign", "-", path.join(modules, f)], { stdio: "inherit" });
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
};
