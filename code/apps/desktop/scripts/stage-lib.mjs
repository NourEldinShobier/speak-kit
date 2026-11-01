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
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\1/g;
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
