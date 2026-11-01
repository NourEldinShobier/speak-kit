// Builds the Windows installer and the portable exe into apps/desktop/release.
//   node scripts/package.mjs [--version 0.3.0] [--dir]   (--dir: unpacked app only, for smoke tests)
// Steps: build engine worker, extension and desktop; stage a plain app folder with a real node_modules (pnpm's symlinks do not
// survive packaging); run electron-builder. Code signing is not set up: the installer is unsigned.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICO_SIZES, logoPng } from "./icons-lib.mjs";
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
      productName: "SpeakKit",
      version,
      description: "Text to speech on your own computer",
      author: "SpeakKit",
      license: "MIT",
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

// Drop binaries for other platforms (onnxruntime ships all of them; koffi too).
const rm = (p) => rmSync(p, { recursive: true, force: true });
const ort = path.join(stage, "node_modules/onnxruntime-node/bin/napi-v3");
if (existsSync(ort)) {
  for (const os of readdirSync(ort)) if (os !== "win32") rm(path.join(ort, os));
  if (existsSync(path.join(ort, "win32"))) for (const arch of readdirSync(path.join(ort, "win32"))) if (arch !== "x64") rm(path.join(ort, "win32", arch));
}
const koffiBuild = path.join(stage, "node_modules/koffi/build/koffi");
if (existsSync(koffiBuild)) for (const d of readdirSync(koffiBuild)) if (d !== "win32_x64") rm(path.join(koffiBuild, d));

// 3. installer icon, rasterised from the logo SVGs
mkdirSync(res, { recursive: true });
writeFileSync(path.join(res, "icon.ico"), icoFromPngs(ICO_SIZES.map((size) => ({ size, png: logoPng(size) }))));

// 4. electron-builder
console.log("== electron-builder");
const electronDir = path.dirname(realpathSync(path.join(desktop, "node_modules/electron/package.json")));
const electronVersion = json(path.join(electronDir, "package.json")).version;
const targets = flag("--dir") ? ["--dir"] : ["nsis", "portable"];
run(
  "pnpm",
  [
    "exec",
    "electron-builder",
    "--win",
    ...targets,
    "--x64",
    "--publish",
    "never",
    "--config",
    "electron-builder.yml",
    `-c.electronVersion=${electronVersion}`,
    `-c.electronDist=${path.join(electronDir, "dist")}`,
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
