import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import type { CliIo } from "./commands";
import type { Launcher } from "./launcher";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin as AsyncIterable<Buffer>) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

/** The real process: stdout, stderr, the disk, the network and standard input. */
export function nodeIo(version: string, launcher?: Launcher): CliIo {
  return {
    out: (line) => void process.stdout.write(`${line}\n`),
    err: (line) => void process.stderr.write(`${line}\n`),
    env: process.env,
    platform: process.platform,
    home: homedir(),
    cwd: process.cwd(),
    version,
    fetch,
    files: {
      stat: (file) =>
        stat(file).then(
          (s) => ({ size: s.size, file: s.isFile() }),
          () => null,
        ),
      read: (file) => readFile(file, "utf8"),
      write: async (file, text) => {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, text);
      },
    },
    stdin: readStdin,
    stdinLines: () => createInterface({ input: process.stdin, crlfDelay: Infinity }),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    ...(launcher && { launcher }),
  };
}
