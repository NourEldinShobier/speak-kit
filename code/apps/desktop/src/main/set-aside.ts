import { readFile, rename } from "node:fs/promises";

/** A JSON file that no longer parses (or, with `accept`, parses to a value of the wrong shape) is renamed to `<name>.bad` (the user's data is kept) so the app can start from defaults. Returns the new path, or null when the file is fine or absent. */
export async function setAsideIfCorrupt(file: string, accept: (parsed: unknown) => boolean = () => true): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return null;
  }
  let ok: boolean;
  try {
    ok = accept(JSON.parse(text));
  } catch {
    ok = false;
  }
  if (ok) return null;
  const bad = `${file}.bad`;
  await rename(file, bad);
  return bad;
}
