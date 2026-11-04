// Builds the installers into apps/desktop/release: on Windows the NSIS installer and the portable exe, on a Mac a dmg and a zip
// for arm64 and for x64.
//   node scripts/package.mjs [--platform win|mac] [--version 0.3.0] [--dir]   (--dir: unpacked app only, for smoke tests)
// Steps: build engine worker, extension and desktop; stage a plain app folder with a real node_modules (pnpm's symlinks do not
// survive packaging); run electron-builder. Code signing is not set up: the Windows installer is unsigned and the macOS app only
// carries an ad-hoc signature (scripts/after-pack.cjs).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICO_SIZES, macIconPng, winIconPng } from "./icons-lib.mjs";
import { icoFromPngs, importedPackages } from "./stage-lib.mjs";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = path.resolve(desktop, "../..");
const stage = path.join(desktop, "dist-app");
const res = path.join(desktop, "dist-app-res");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const run = (cmd, a, cwd, env = {}) => {
  const r = spawnSync(cmd, a, { cwd, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  if (r.status) throw new Error(`${cmd} ${a.join(" ")} failed with ${r.status}`);
};
const json = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Version of `name` as installed for `from`: walks up node_modules folders like Node's resolver. */
function installedVersion(name, from) {
  for (let dir = realpathSync(from); ; dir = path.dirname(dir)) {
    const p = path.join(dir, "node_modules", name, "package.json");
    if (existsSync(p)) return json(p).version;
    if (path.dirname(dir) === dir) throw new Error(`cannot find ${name} from ${from}`);
  }
}

const pkg = json(path.join(desktop, "package.json"));
const version = value("--version") ?? pkg.version;
const platform = value("--platform") ?? "win";
if (!["win", "mac"].includes(platform)) throw new Error(`--platform must be win or mac, not ${platform}`);
const mac = platform === "mac";

// 1. builds
console.log("== build engine worker, extension, desktop");
run("pnpm", ["exec", "vp", "pack"], path.join(code, "packages/engine"));
run("pnpm", ["exec", "vp", "build", "--outDir", "dist-pack"], path.join(code, "apps/extension"));
run("pnpm", ["exec", "vp", "build"], desktop, { SPEAKKIT_PACKAGE: "1" }); // SPEAKKIT_PACKAGE strips test-only code

// 2. staging folder
console.log("== stage");
rmSync(stage, { recursive: true, force: true });
mkdirSync(path.join(stage, "dist/worker"), { recursive: true });
for (const d of ["main", "preload", "renderer"]) cpSync(path.join(desktop, "dist", d), path.join(stage, "dist", d), { recursive: true });
cpSync(path.join(code, "packages/engine/dist/worker.js"), path.join(stage, "dist/worker/worker.js"));

const built = ["dist/main/index.js", "dist/main/mp3-worker.js", "dist/preload/index.cjs", "dist/worker/worker.js"];
const needed = new Set(built.flatMap((f) => importedPackages(readFileSync(path.join(stage, f), "utf8"))));
const engineDir = path.join(code, "packages/engine");
const dependencies = {};
for (const name of [...needed].sort()) dependencies[name] = installedVersion(name, name === "kokoro-js" ? engineDir : desktop);
// kokoro-js pulls transformers.js and onnxruntime; pin what was tested instead of whatever npm finds today.
const kokoroDir = path.dirname(realpathSync(path.join(engineDir, "node_modules/kokoro-js")));
const tfVersion = installedVersion("@huggingface/transformers", kokoroDir);
const overrides = {
  "@huggingface/transformers": tfVersion,
  "onnxruntime-node": installedVersion("onnxruntime-node", path.join(kokoroDir, "@huggingface/transformers")),
};
writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify(
    {
      name: "speakkit",
      productName: "Speak Kit",
      version,
      description: "Text to speech on your own computer",
      author: "Speak Kit",
      license: "Apache-2.0",
      type: "module",
      main: "dist/main/index.js",
      dependencies,
      overrides,
    },
    null,
    2,
  ),
);
console.log(
  "runtime packages:",
  Object.entries(dependencies)
    .map(([k, v]) => `${k}@${v}`)
    .join(", "),
);
run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], stage);

// One app folder serves both macOS architectures, but npm only installs the optional native packages (sharp) of this machine's
// architecture: fetch the other one's into a scratch folder and copy in the packages that are missing.
if (mac) {
  const other = path.join(desktop, "dist-app-other");
  rmSync(other, { recursive: true, force: true });
  mkdirSync(other);
  cpSync(path.join(stage, "package.json"), path.join(other, "package.json"));
  const cpu = process.arch === "arm64" ? "x64" : "arm64";
  run("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error", "--os=darwin", `--cpu=${cpu}`], other);
  const modules = (d) => path.join(d, "node_modules");
  for (const name of readdirSync(modules(other))) {
    const names = name.startsWith("@") ? readdirSync(path.join(modules(other), name)).map((n) => `${name}/${n}`) : [name];
    for (const n of names) if (!existsSync(path.join(modules(stage), n))) cpSync(path.join(modules(other), n), path.join(modules(stage), n), { recursive: true });
  }
  rmSync(other, { recursive: true, force: true });
}

// Drop binaries for other platforms (onnxruntime ships all of them; koffi too). macOS keeps both architectures here;
// scripts/after-pack.cjs drops the one a given app does not run on.
const rm = (p) => rmSync(p, { recursive: true, force: true });
const ort = path.join(stage, "node_modules/onnxruntime-node/bin/napi-v3");
const keepOs = mac ? "darwin" : "win32";
if (existsSync(ort)) {
  for (const os of readdirSync(ort)) if (os !== keepOs) rm(path.join(ort, os));
  if (!mac && existsSync(path.join(ort, "win32"))) for (const arch of readdirSync(path.join(ort, "win32"))) if (arch !== "x64") rm(path.join(ort, "win32", arch));
}
const koffiBuild = path.join(stage, "node_modules/koffi/build/koffi");
if (existsSync(koffiBuild)) for (const d of readdirSync(koffiBuild)) if (!(mac ? d.startsWith("darwin_") : d === "win32_x64")) rm(path.join(koffiBuild, d));

// 3. installer icon, rasterised from the logo SVGs (electron-builder turns the 1024 px PNG into the macOS .icns)
mkdirSync(res, { recursive: true });
if (mac) writeFileSync(path.join(res, "icon.png"), macIconPng());
else writeFileSync(path.join(res, "icon.ico"), icoFromPngs(ICO_SIZES.map((size) => ({ size, png: winIconPng(size) }))));

// 4. electron-builder
console.log("== electron-builder");
const electronDir = path.dirname(realpathSync(path.join(desktop, "node_modules/electron/package.json")));
const electronVersion = json(path.join(electronDir, "package.json")).version;
// pnpm does not always run electron's download step (CI, fresh worktrees); the Windows build reuses that download.
if (!mac && !existsSync(path.join(electronDir, "dist"))) run("node", ["install.js"], electronDir);
const targets = flag("--dir") ? ["--dir"] : mac ? ["dmg", "zip"] : ["nsis", "portable"];
run(
  "pnpm",
  [
    "exec",
    "electron-builder",
    ...(mac ? ["--mac", ...targets, "--arm64", "--x64"] : ["--win", ...targets, "--x64"]),
    "--publish",
    "never",
    "--config",
    "electron-builder.yml",
    `-c.electronVersion=${electronVersion}`,
    // Windows reuses the installed Electron; the macOS build needs one per architecture and lets electron-builder download them.
    ...(mac ? [] : [`-c.electronDist=${path.join(electronDir, "dist")}`]),
    `-c.extraMetadata.version=${version}`,
  ],
  desktop,
  { CSC_IDENTITY_AUTO_DISCOVERY: "false" },
);

const out = path.join(desktop, "release");
for (const f of readdirSync(out)) {
  const p = path.join(out, f);
  if (statSync(p).isFile()) console.log(`${f}  ${(statSync(p).size / 1e6).toFixed(1)} MB`);
}
