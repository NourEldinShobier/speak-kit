import { readFile, rename } from "node:fs/promises";

/** A JSON file that no longer parses is renamed to `<name>.bad` (the user's data is kept) so the app can start from defaults. Returns the new path, or null when the file is fine or absent. */
export async function setAsideIfCorrupt(file: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return null;
  }
  try {
    JSON.parse(text);
    return null;
  } catch {
    const bad = `${file}.bad`;
    await rename(file, bad);
    return bad;
  }
}
