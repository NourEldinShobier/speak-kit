import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { runLabsCommand, type LabsState } from "../shared/labs";
import { parseConfig } from "../shared/schemas";

/** Exit codes of the labs commands: the usage and unknown-lab codes of runLabsCommand, plus 4 for a settings file that cannot be read. */
export const LABS_UNREADABLE = 4;

const fileOf = (dir: string) => path.join(dir, "config.json");
const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** The raw settings object, `{}` when the file does not exist, null when it exists but is not a JSON object. Never touches the file. */
async function readRaw(dir: string): Promise<Record<string, unknown> | null> {
  let text: string;
  try {
    text = await readFile(fileOf(dir), "utf8");
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT" ? {} : null;
  }
  try {
    const raw: unknown = JSON.parse(text);
    return isRecord(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** The labs on disk, or null when the settings file cannot be read. Read only: nothing is renamed, repaired or written. */
export async function readLabsFile(dir: string): Promise<LabsState | null> {
  const raw = await readRaw(dir);
  return raw && parseConfig(raw).labs;
}

/** Writes the `labs` key only. Every other key, including invalid fields and keys of a newer version, stays exactly as stored. */
async function writeLabsKey(dir: string, raw: Record<string, unknown>, labs: LabsState): Promise<void> {
  await mkdir(dir, { recursive: true });
  const tmp = `${fileOf(dir)}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ ...raw, labs }, null, "\t"));
  await rename(tmp, fileOf(dir));
}

/** `labs list|on|off <lab>` against the settings file in `dir`; returns the exit code. */
export async function runLabsFile(args: readonly string[], dir: string, print: (line: string) => void): Promise<number> {
  const raw = await readRaw(dir);
  if (!raw) {
    print(`the settings file ${fileOf(dir)} cannot be read; nothing was changed`);
    return LABS_UNREADABLE;
  }
  const r = runLabsCommand(args, parseConfig(raw).labs);
  print(r.out);
  if (r.next) await writeLabsKey(dir, raw, r.next);
  return r.code;
}
