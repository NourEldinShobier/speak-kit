import { createHash } from "node:crypto";
import path from "node:path";
import type { Fs } from "./fs";
import type { ExportedFile } from "./types";

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** A file name that is valid on Windows and macOS: no reserved characters or device names, no trailing dot or space, at most 100 characters. */
export function safeName(title: string, fallback = "Transcript"): string {
  let n = title
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  n = Array.from(n)
    .slice(0, 100)
    .join("")
    .replace(/[. ]+$/, "")
    .replace(/^\.+/, "")
    .trim();
  if (!n || RESERVED.test(n.split(".")[0]!)) return n ? `${n}_` : fallback;
  return n;
}

export const sha256 = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");

/** `name.ext`, then `name (2).ext` and so on until a free name; an existing file is never a candidate. */
export async function freePath(fs: Fs, dir: string, name: string, ext: string): Promise<string> {
  for (let i = 1; ; i++) {
    const file = path.join(dir, i === 1 ? `${name}.${ext}` : `${name} (${i}).${ext}`);
    if (!(await fs.exists(file))) return file;
  }
}

export interface Saved extends ExportedFile {
  /** "new": a file that did not exist; "replaced": the file from the last export, unchanged since, rewritten; "copy": the earlier file was changed or something else took its name, so this is a new file beside it. */
  kind: "new" | "replaced" | "copy";
}

/**
 * Writes an export. A file this app wrote before is rewritten only when it still has the hash recorded then; a file the person changed is left alone
 * and the export goes to a free name beside it. Nothing is ever overwritten otherwise.
 */
export async function saveExport(fs: Fs, dir: string, title: string, ext: string, content: string, previous?: ExportedFile): Promise<Saved> {
  const hash = sha256(content);
  if (previous) {
    const now = await fs.read(previous.path);
    if (now && sha256(now) === previous.sha256) {
      await fs.write(previous.path, content);
      return { path: previous.path, sha256: hash, kind: "replaced" };
    }
    if (!now) {
      // The person moved or deleted it: write a fresh file under the name, never claiming a path that now belongs to something else.
      const file = await freePath(fs, dir, safeName(title), ext);
      await fs.write(file, content);
      return { path: file, sha256: hash, kind: "new" };
    }
  }
  const file = await freePath(fs, dir, safeName(title), ext);
  await fs.write(file, content);
  return { path: file, sha256: hash, kind: previous ? "copy" : "new" };
}

/** Deletes a file this app exported only when it is unchanged; returns false (and leaves it) when the person changed it. A file already gone counts as removed. */
export async function removeIfUnchanged(fs: Fs, f: ExportedFile): Promise<boolean> {
  const now = await fs.read(f.path);
  if (!now) return true;
  if (sha256(now) !== f.sha256) return false;
  await fs.remove(f.path);
  return true;
}
