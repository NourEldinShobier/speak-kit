// Pure helpers of the packaging scripts (tested in tests/stage-lib.test.ts).
import { builtinModules } from "node:module";

/** Package name of a bare import specifier: "pdfjs-dist/legacy/x.mjs" -> "pdfjs-dist", "@a/b/c" -> "@a/b". Relative, node: and electron imports -> null. */
export function packageOf(specifier) {
  if (/^(\.|\/|node:|data:|file:)/.test(specifier)) return null;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  if (!name || name === "electron" || builtinModules.includes(name)) return null;
  return name;
}

/** Every package a built JavaScript file imports (static, dynamic and require). */
export function importedPackages(source) {
  const found = new Set();
  const re = /(?:(?<![\w"'.])from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\1/g;
  for (let m; (m = re.exec(source));) {
    const name = packageOf(m[2]);
    if (name) found.add(name);
  }
  return [...found].sort();
}

/** A Windows .ico holding the given square PNG images ({ size, png }); Windows reads PNG-compressed entries (256 px is stored as 0). */
export function icoFromPngs(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head[e] = head[e + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4); // planes
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((m) => m.png)]);
}

/** Is this directory name a native build for the other macOS architecture ("sharp-darwin-x64" or "darwin_x64" while packaging arm64)? */
export function foreignMacArch(name, arch) {
  const m = /darwin[-_](arm64|x64)$/.exec(name);
  return !!m && m[1] !== arch;
}

/**
 * Which directory of node_modules/@fugood to keep in the app: the addon loader, and the native build for the target. macOS keeps the Metal builds of both
 * architectures (after-pack drops the one an app does not run on); Windows keeps the Vulkan build and the plain CPU one it falls back to. CUDA, WASM and
 * other systems are never loaded.
 */
export function keepWhisperPackage(name, mac) {
  return name === "whisper.node" || (mac ? /-darwin-(arm64|x64)$/ : /-win32-x64(-vulkan)?$/).test(name);
}

/**
 * The codesign calls that seal a macOS app, in order. Nested helper apps and frameworks get the inherited entitlements and the main bundle the full set,
 * the way electron-builder signs a release, so an ad-hoc build carries the same entitlements per executable. No --deep: it would stamp the main set on every helper.
 */
export function macSigningPlan({ app, nested, entitlements, inherit }) {
  const sign = (target, plist) => ["--force", "--sign", "-", "--options", "runtime", ...(plist ? ["--entitlements", plist] : []), target];
  return [...nested.map((n) => sign(n, /\.(framework|dylib)$/.test(n) ? null : inherit)), sign(app, entitlements)];
}

/**
 * The Electron fuses of a packaged app, by name. On macOS the app binary never runs as plain Node: the model host is a utility process and the command
 * line is `Speak Kit --speakkit-cli`. Windows keeps RunAsNode because its app is a window program with no console, so the command line shim needs the
 * binary in Node mode to have a terminal to write to.
 */
export function fusePlan(mac) {
  return { RunAsNode: !mac, EnableNodeOptionsEnvironmentVariable: false, EnableNodeCliInspectArguments: false, EnableCookieEncryption: true };
}
