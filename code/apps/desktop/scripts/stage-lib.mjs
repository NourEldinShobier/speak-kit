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

/**
 * A Windows .ico holding one 32-bit image. `bgra` is top-down BGRA (what logoBitmap returns). ICO stores a BMP without file
 * header, bottom-up, with a 1-bit AND mask that is ignored when the alpha channel is present.
 */
export function icoFromBgra(bgra, size) {
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  const dib = Buffer.alloc(40 + bgra.length + mask.length);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8); // height counts the image and the mask
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(bgra.length + mask.length, 20);
  for (let y = 0; y < size; y++) bgra.copy(dib, 40 + (size - 1 - y) * size * 4, y * size * 4, (y + 1) * size * 4);
  mask.copy(dib, 40 + bgra.length);
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(1, 4); // one image
  head[6] = size >= 256 ? 0 : size;
  head[7] = size >= 256 ? 0 : size;
  head.writeUInt16LE(1, 10); // planes
  head.writeUInt16LE(32, 12);
  head.writeUInt32LE(dib.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, dib]);
}
