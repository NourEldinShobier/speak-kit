import { rm } from "node:fs/promises";
import { join } from "node:path";

/** Files and folders earlier versions kept in the data folder for engines and cloned voices that no longer exist. */
const LEFTOVERS = [join("engines", "chatterbox"), "chatterbox", "voices", "engine.json", "engine.json.bad"];

/** Deletes them, each on its own: one that cannot be removed (in use, no permission) does not stop the rest or the server. */
export async function removeLeftovers(dataDir: string): Promise<void> {
  await Promise.all(LEFTOVERS.map((p) => rm(join(dataDir, p), { recursive: true, force: true }).catch(() => {})));
}
