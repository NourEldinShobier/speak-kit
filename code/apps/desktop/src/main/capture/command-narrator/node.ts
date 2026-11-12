import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CommandNarratorDeps, RunCommand } from ".";

/** Starts the program directly (no shell), with the time limit and a cap on what it may print. */
export const runCommand: RunCommand = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1_000_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });

/** A file in a folder of its own in the system temp folder, so nothing else can be mistaken for it; the folder goes with the file. */
export const writeTemp: CommandNarratorDeps["writeTemp"] = async (name, data) => {
  const dir = await mkdtemp(path.join(tmpdir(), "speakkit-stt-"));
  const file = path.join(dir, name);
  await writeFile(file, data);
  return { path: file, remove: () => rm(dir, { recursive: true, force: true }) };
};

export const newName = (): string => `speech-${randomBytes(4).toString("hex")}`;
