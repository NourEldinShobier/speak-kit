import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readStoredHistory } from "@speakkit/dictation";
import { fail, LIMITS, type Reply } from "../shared/control/contract";
import { discoveryFile, portOpen, processAlive, readDiscovery } from "../main/control/discovery";
import { mcpFlags, serveMcp } from "./mcp";
import { diskSources, runRead } from "./reads";
import { skillFilePath, userDataDir } from "./paths";
import { runCli, type Io } from "./run";

/** Where Claude Code looks for a personal skill. */
const skillFile = skillFilePath(os.homedir());
const dir = userDataDir(process.env, process.platform, os.homedir());

const io: Io = {
  out: (t) => void process.stdout.write(t),
  err: (t) => void process.stderr.write(t),
  discovery: () => readDiscovery(discoveryFile(dir), processAlive, portOpen),
  async launch() {
    // The launcher is next to the shim that started this script: SPEAKKIT_APP is set by it. Without it there is nothing safe to start.
    const exe = process.env.SPEAKKIT_APP;
    if (!exe) return false;
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE; // the app must start as an app, not as Node
    const [cmd, args] = process.platform === "darwin" ? ["open", ["-a", exe]] : [exe, []];
    spawn(cmd, args, { detached: true, stdio: "ignore", env }).unref();
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await readDiscovery(discoveryFile(dir), processAlive, portOpen)) return true;
    }
    return false;
  },
  async offlineHistory({ search, limit }) {
    const read = async (name: string): Promise<unknown> => {
      try {
        return JSON.parse(await readFile(path.join(dir, name), "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw e;
      }
    };
    try {
      const config = (await read("config.json")) as { dictation?: { retention?: unknown } } | undefined;
      const stored = (await read("dictation-history.json")) ?? [];
      return readStoredHistory(stored, { now: Date.now(), retention: config?.dictation?.retention, ...(search && { search }), limit });
    } catch {
      return null; // a file that cannot be read is not an empty history
    }
  },
  reads: diskSources(dir),
  async readConfig() {
    try {
      return JSON.parse(await readFile(path.join(dir, "config.json"), "utf8"));
    } catch {
      return undefined; // missing or damaged: the list shows every experiment off, and nothing is written
    }
  },
  async file(name) {
    try {
      const s = await stat(name);
      if (!s.isFile()) return { kind: "none" };
      if (s.size > LIMITS.speakFileBytes) return { kind: "too-large" };
      return { kind: "text", text: await readFile(name, "utf8") };
    } catch {
      return { kind: "none" }; // not a path (a sentence, a name too long for the system): the words are the text
    }
  },
  async readSkill() {
    try {
      return await readFile(skillFile, "utf8");
    } catch {
      return undefined; // not installed
    }
  },
  async writeSkill(text) {
    await mkdir(path.dirname(skillFile), { recursive: true });
    await writeFile(skillFile, text);
    return skillFile;
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  async post(d, req, timeoutMs): Promise<Reply> {
    const res = await fetch(`http://127.0.0.1:${d.port}/control`, {
      method: "POST",
      headers: { authorization: `Bearer ${d.token}`, "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(Math.max(timeoutMs, LIMITS.timeoutMs)),
    });
    return (await res.json()) as Reply;
  },
  async stdin() {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  },
};

if (process.argv[2] === "mcp")
  await serveMcp(process.stdin, process.stdout, {
    async call(req) {
      const d = await io.discovery();
      if (!d) return fail("not-running", "Speak Kit is not running.");
      try {
        return await io.post(d, req, LIMITS.timeoutMs);
      } catch {
        return fail("not-running", "Speak Kit did not answer.");
      }
    },
    read: (r) => runRead(r, io.reads),
    flags: async () => mcpFlags(await io.readConfig()),
  });
else process.exitCode = await runCli(process.argv.slice(2), io);
