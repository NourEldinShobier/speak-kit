import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fail, LIMITS, type Reply } from "../shared/control/contract";
import { discoveryFile, readDiscovery } from "../main/control/discovery";
import { serveMcp } from "./mcp";
import { userDataDir } from "./paths";
import { runCli, type Io } from "./run";

const dir = userDataDir(process.env, process.platform, os.homedir());

const io: Io = {
  out: (t) => void process.stdout.write(t),
  err: (t) => void process.stderr.write(t),
  discovery: () => readDiscovery(discoveryFile(dir)),
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
      if (await readDiscovery(discoveryFile(dir))) return true;
    }
    return false;
  },
  async offlineHistory({ search, limit }) {
    try {
      const all = JSON.parse(await readFile(path.join(dir, "dictation-history.json"), "utf8")) as { id: string; at: number; text: string }[];
      const words = (search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      return all.filter((e) => words.every((w) => e.text.toLowerCase().includes(w))).slice(0, limit);
    } catch {
      return [];
    }
  },
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
  await serveMcp(process.stdin, process.stdout, async (req) => {
    const d = await io.discovery();
    if (!d) return fail("not-running", "Speak Kit is not running.");
    try {
      return await io.post(d, req, LIMITS.timeoutMs);
    } catch {
      return fail("not-running", "Speak Kit did not answer.");
    }
  });
else process.exitCode = await runCli(process.argv.slice(2), io);
