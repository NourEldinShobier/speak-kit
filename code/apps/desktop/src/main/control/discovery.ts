import { readFileSync, rmSync } from "node:fs";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as v from "valibot";

/** Where the running app says how to reach it. */
export interface Discovery {
  port: number;
  token: string;
  pid: number;
  version: string;
}

const Schema = v.object({
  port: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535)),
  token: v.pipe(v.string(), v.minLength(16)),
  pid: v.pipe(v.number(), v.integer(), v.minValue(1)),
  version: v.string(),
});

export const discoveryFile = (dataDir: string): string => path.join(dataDir, "control.json");

/** True while a process with this id exists (also when it belongs to another user: it still blocks the file). */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Written at every start, readable by its owner only (the data folder belongs to the user on Windows, and the mode applies on macOS). */
export async function writeDiscovery(file: string, d: Discovery): Promise<void> {
  await writeFile(file, JSON.stringify(d), { mode: 0o600 });
  try {
    await chmod(file, 0o600);
  } catch {
    // A file system without modes keeps the rights of its folder.
  }
}

/** The file content, or null when it is missing, damaged or names a process that is gone (a crash leaves the file behind). Read again on every call, never cached. */
export async function readDiscovery(file: string, alive: (pid: number) => boolean = processAlive): Promise<Discovery | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
  const parsed = v.safeParse(Schema, raw);
  return parsed.success && alive(parsed.output.pid) ? parsed.output : null;
}

/** Removes the file on quit, but only while it still belongs to this process: a newer instance may have replaced it. */
export async function removeDiscovery(file: string, pid: number): Promise<void> {
  const d = await readDiscovery(file, () => true);
  if (d?.pid === pid) await rm(file, { force: true });
}

/** The same as `removeDiscovery`, for the moment the app quits: the process may end before an asynchronous removal runs. */
export function removeDiscoverySync(file: string, pid: number): void {
  try {
    if ((JSON.parse(readFileSync(file, "utf8")) as { pid?: number }).pid === pid) rmSync(file, { force: true });
  } catch {
    // Nothing to remove: the file is missing or not ours.
  }
}
