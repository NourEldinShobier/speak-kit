import { open, stat } from "node:fs/promises";

const WINDOW = 64 * 1024;

/** Keeps the last `n` lines of a text, dropping a half line cut by the read window. */
export function tailLines(text: string, n: number, cut = false): string[] {
  const all = text.split(/\r?\n/);
  if (cut) all.shift();
  return all.filter(Boolean).slice(-n);
}

/** The last `n` lines of a file, reading only its final 64 KB. A missing file is an empty log. */
export async function readLogTail(file: string, n: number): Promise<{ size: number; lines: string[] }> {
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return { size: 0, lines: [] };
  }
  const start = Math.max(0, size - WINDOW);
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    return { size, lines: tailLines(buf.toString("utf8"), n, start > 0) };
  } finally {
    await fh.close();
  }
}

/** Log lines for the live log tail: null `lines` when the file did not change since `sinceSize`, so the view is not redrawn on every poll. */
export async function logSince(file: string, sinceSize: number, n = 200): Promise<{ size: number; lines: string[] | null }> {
  let size = 0;
  try {
    size = (await stat(file)).size;
  } catch {
    /* no log yet */
  }
  if (size === sinceSize && sinceSize > 0) return { size, lines: null };
  return { size, lines: (await readLogTail(file, n)).lines };
}
