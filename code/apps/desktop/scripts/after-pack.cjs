// electron-builder afterPack hook (see electron-builder.yml): sets the Electron fuses, then, for macOS, drop the native binaries of the other architecture from
// the app and give it an ad-hoc signature. Apple Silicon refuses to run code without a valid signature, and Electron's own
// signature breaks once the app is renamed and filled; a real Developer ID signature replaces this later.
const { execFileSync } = require("node:child_process");
const { closeSync, existsSync, openSync, readdirSync, readSync, realpathSync, rmSync, statSync } = require("node:fs");
const path = require("node:path");

const ARCHS = { 1: "x64", 3: "arm64" }; // electron-builder's Arch enum

// Flipped here rather than through electron-builder's electronFuses option: that option runs after this hook, and changing the
// binary after the ad-hoc signature below would invalidate it. See fusePlan for RunAsNode.
async function setFuses(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = await import("@electron/fuses");
  const { fusePlan } = await import("./stage-lib.mjs");
  const mac = context.electronPlatformName === "darwin";
  const { productFilename } = context.packager.appInfo;
  await flipFuses(path.join(context.appOutDir, mac ? `${productFilename}.app` : `${productFilename}.exe`), {
    version: FuseVersion.V1,
    ...Object.fromEntries(Object.entries(fusePlan(mac)).map(([name, on]) => [FuseV1Options[name], on])),
  });
}

exports.default = async function afterPack(context) {
  await setFuses(context);
  if (context.electronPlatformName !== "darwin") return;
  const { foreignMacArch, macSigningPlan } = await import("./stage-lib.mjs");
  const arch = ARCHS[context.arch];
  if (!arch) throw new Error(`unsupported macOS architecture ${context.arch}`);
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const modules = path.join(app, "Contents/Resources/app/node_modules");
  const other = arch === "arm64" ? "x64" : "arm64";

  rmSync(path.join(modules, "onnxruntime-node/bin/napi-v3/darwin", other), { recursive: true, force: true });
  for (const dir of [path.join(modules, "@koromix"), path.join(modules, "@img"), path.join(modules, "@fugood")]) {
    if (existsSync(dir)) for (const d of readdirSync(dir)) if (foreignMacArch(d, arch)) rmSync(path.join(dir, d), { recursive: true, force: true });
  }

  // Loose native libraries are not covered by --deep: sign each before sealing the bundle.
  // Files only: a package folder can be named like one (whisper.node), and codesign refuses a folder that is not a bundle.
  const natives = readdirSync(modules, { recursive: true }).filter((f) => /\.(node|dylib)$/.test(f) && statSync(path.join(modules, f)).isFile());
  for (const f of natives) execFileSync("codesign", ["--force", "--sign", "-", "--options", "runtime", path.join(modules, f)], { stdio: "inherit" });
  // Helpers and frameworks first (inner before outer), then the main bundle, each with its own entitlements (see electron-builder.yml).
  const frameworks = path.join(app, "Contents/Frameworks");
  const top = existsSync(frameworks) ? readdirSync(frameworks).filter((f) => /\.(app|framework)$/.test(f)) : [];
  // Libraries and helper programs inside a framework (Helpers/app_shim_loader and the like) are sealed by the framework only if they are signed first.
  // Found by their Mach-O header, once each (Versions/Current is a link to Versions/A), without the framework's own main binary.
  const MACH_O = new Set([0xcffaedfe, 0xcefaedfe, 0xfeedfacf, 0xfeedface, 0xcafebabe, 0xbebafeca]);
  const isMachO = (file) => {
    const fd = openSync(file, "r");
    try {
      const head = Buffer.alloc(4);
      return readSync(fd, head, 0, 4, 0) === 4 && MACH_O.has(head.readUInt32BE(0));
    } finally {
      closeSync(fd);
    }
  };
  const libs = top.flatMap((f) => {
    if (!f.endsWith(".framework")) return [];
    const root = path.join(frameworks, f);
    const own = f.slice(0, -".framework".length);
    const seen = new Set();
    return readdirSync(root, { recursive: true })
      .map((x) => path.join(root, x))
      .filter((p) => path.basename(p) !== own && statSync(p).isFile() && isMachO(p))
      .filter((p) => {
        const real = realpathSync(p);
        return seen.has(real) ? false : (seen.add(real), true);
      });
  });
  const nested = [...libs, ...top.map((f) => path.join(frameworks, f))];
  const build = path.join(__dirname, "../build");
  const plan = macSigningPlan({ app, nested, entitlements: path.join(build, "entitlements.mac.plist"), inherit: path.join(build, "entitlements.mac.inherit.plist") });
  for (const args of plan) execFileSync("codesign", args, { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
};
