// Builds the production extension and packs it as the zip the Chrome Web Store and Edge Add-ons take, then prints the checks the stores run.
// Usage: node scripts/pack-store.mjs [--no-build] [--dir <built extension>] [--out <zip>]   (from apps/extension; exit code 1 when a check fails)
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const rel = (dir, f) => relative(dir, f).split(sep).join("/");

/** [width, height] of a PNG, or null when the file is not one. */
const pngSize = (buf) => (buf.length > 24 && buf.toString("latin1", 1, 4) === "PNG" ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null);

/** Every file path the manifest points at. */
export function referencedFiles(m) {
  const out = [];
  const add = (p) => p && out.push(p);
  Object.values(m.icons ?? {}).forEach(add);
  add(m.action?.default_popup);
  const di = m.action?.default_icon;
  Object.values(typeof di === "string" ? { x: di } : (di ?? {})).forEach(add);
  add(m.background?.service_worker);
  add(m.options_ui?.page);
  add(m.side_panel?.default_path);
  for (const c of m.content_scripts ?? []) [...(c.js ?? []), ...(c.css ?? [])].forEach(add);
  for (const w of m.web_accessible_resources ?? []) (w.resources ?? []).forEach(add);
  return [...new Set(out)];
}

/** The checks the stores make on an unpacked extension folder. Returns [{ name, ok, detail }]. */
export function checkPackage(dir) {
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok, detail });
  let m;
  try {
    m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    check("manifest.json at the root", true);
  } catch (e) {
    check("manifest.json at the root", false, String(e.message ?? e));
    return results;
  }
  const files = walk(dir);
  const names = new Set(files.map((f) => rel(dir, f)));
  const text = (ext) => files.filter((f) => ext.some((x) => f.endsWith(x))).map((f) => [rel(dir, f), readFileSync(f, "utf8")]);
  const hits = (list, re) => list.filter(([, s]) => re.test(s)).map(([n]) => n);

  check("manifest_version is 3", m.manifest_version === 3, `got ${m.manifest_version}`);
  check("name present, 75 characters or fewer", typeof m.name === "string" && m.name.length > 0 && m.name.length <= 75);
  check("version is 1 to 4 dot-separated integers", /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(m.version ?? ""), `got ${m.version}`);
  check("description present, 132 characters or fewer", typeof m.description === "string" && m.description.length > 0 && m.description.length <= 132, `${m.description?.length ?? 0} characters`);
  for (const size of [16, 32, 48, 128]) {
    const p = m.icons?.[size];
    const png = p && names.has(p) ? pngSize(readFileSync(join(dir, p))) : null;
    check(`icon ${size}x${size}`, !!png && png[0] === size && png[1] === size, p ? `${p}: ${png ? png.join("x") : "missing or not a PNG"}` : "not in manifest.icons");
  }
  const missing = referencedFiles(m).filter((p) => !names.has(p));
  check("every file the manifest names is in the package", missing.length === 0, missing.join(", "));
  const maps = [...names].filter((n) => n.endsWith(".map"));
  const mapRefs = hits(text([".js", ".css", ".mjs"]), /sourceMappingURL=/);
  check("no source maps", maps.length === 0 && mapRefs.length === 0, [...maps, ...mapRefs].join(", "));
  const code = text([".js", ".mjs", ".html"]);
  const csp = JSON.stringify(m.content_security_policy ?? "");
  check("no eval or new Function", hits(code, /\beval\s*\(|\bnew\s+Function\s*\(/).length === 0 && !csp.includes("unsafe-eval"), hits(code, /\beval\s*\(|\bnew\s+Function\s*\(/).join(", "));
  const remote = hits(code, /<script[^>]+src=["']?https?:|\bimportScripts\(\s*["']https?:|\bimport\(\s*["']https?:|\bfrom\s*["']https?:/);
  check("no remote code (script tags, importScripts, import() from http)", remote.length === 0 && !/https?:/.test(csp), remote.join(", "));
  const hooks = hits(code, /__TEST__|speakkit\.idleclose|testing\/entry/);
  check("no test hooks", hooks.length === 0, hooks.join(", "));
  check("no test or source files", ![...names].some((n) => /\.(test|spec)\.|\.tsx?$/.test(n)), [...names].filter((n) => /\.(test|spec)\.|\.tsx?$/.test(n)).join(", "));
  return results;
}

/** Removes trailing sourceMappingURL comments (a vendored file may point at a map that is not shipped). Returns the files changed. */
export function stripSourceMapComments(dir) {
  const changed = [];
  for (const f of walk(dir).filter((x) => /\.(js|mjs|css)$/.test(x))) {
    const s = readFileSync(f, "utf8");
    const t = s.replace(/\n?\/[/*]# sourceMappingURL=[^\n]*?(\*\/)?\s*$/, "\n");
    if (t !== s) {
      writeFileSync(f, t);
      changed.push(rel(dir, f));
    }
  }
  return changed;
}

/** Zip of every file under dir with paths relative to dir (manifest.json at the root), sorted, with a fixed timestamp so the same input gives the same bytes. */
export function zipDir(dir) {
  const parts = [];
  const central = [];
  let offset = 0;
  const DOS_TIME = 0;
  const DOS_DATE = (46 << 9) | (1 << 5) | 1; // 2026-01-01
  for (const f of walk(dir).sort()) {
    const name = Buffer.from(rel(dir, f));
    const data = readFileSync(f);
    const packed = deflateRawSync(data, { level: 9 });
    const [method, body] = packed.length < data.length ? [8, packed] : [0, data];
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(method, 8);
    head.writeUInt16LE(DOS_TIME, 10);
    head.writeUInt16LE(DOS_DATE, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    parts.push(head, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    head.copy(c, 8, 6, 30); // flags, method, time, date, crc, sizes, name length
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += head.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

function main() {
  const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
  const has = (k) => process.argv.includes(k);
  const dir = resolve(has("--dir") ? arg("--dir") : join(root, "dist-store/pkg"));
  if (!has("--no-build") && !has("--dir")) {
    // A production build: SPEAKKIT_TEST unset means no source maps and __TEST__ false.
    const env = { ...process.env };
    delete env.SPEAKKIT_TEST;
    rmSync(dir, { recursive: true, force: true });
    const r = spawnSync(`pnpm exec vp build --outDir "${dir}"`, { cwd: root, stdio: "inherit", env, shell: true });
    if (r.status) process.exit(r.status);
  }
  const stripped = stripSourceMapComments(dir);
  const results = checkPackage(dir);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const out = resolve(has("--out") ? arg("--out") : join(root, "dist-store", `speakkit-extension-${manifest.version}.zip`));
  mkdirSync(dirname(out), { recursive: true });
  const zip = zipDir(dir);
  writeFileSync(out, zip);
  const files = walk(dir).length;
  if (stripped.length) console.log(`removed a sourceMappingURL comment from ${stripped.join(", ")}`);
  console.log(`\n${manifest.name} ${manifest.version}\n${out}\n${files} files, ${(statSync(out).size / 1024).toFixed(1)} KB zipped\n`);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${!r.ok && r.detail ? `: ${r.detail}` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
