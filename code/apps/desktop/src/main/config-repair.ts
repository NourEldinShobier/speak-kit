import { copyFile } from "node:fs/promises";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Paths of values the file held that loading replaced (a wrong type, a value out of range). A key the file did not have, or an unknown key, is not a repair. */
export function repairedPaths(raw: unknown, parsed: unknown, at = ""): string[] {
  if (!isObject(raw)) return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const here = at ? `${at}.${key}` : key;
    const loaded = isObject(parsed) ? parsed[key] : undefined;
    if (!(isObject(parsed) && key in parsed)) continue; // unknown keys are dropped quietly: they are not a damaged value
    if (isObject(value) && isObject(loaded)) out.push(...repairedPaths(value, loaded, here));
    else if (JSON.stringify(value) !== JSON.stringify(loaded)) out.push(here);
  }
  return out;
}

/** Copies the file to `<name>.invalid` before it is rewritten with repaired values, so nothing the person typed is lost. Returns the copy, or null when nothing was repaired. */
export async function keepInvalidAside(file: string, raw: unknown, parsed: unknown): Promise<string | null> {
  if (repairedPaths(raw, parsed).length === 0) return null;
  const copy = `${file}.invalid`;
  await copyFile(file, copy);
  return copy;
}
