import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const code = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The real standalone server (packages/server CLI) with the real Kokoro model from the shared cache. */
export async function startReal(o: { warm?: boolean; env?: Record<string, string> } = {}): Promise<{ port: number; token: string; pid: number; stop(): Promise<void> }> {
  const child: ChildProcess = spawn(process.execPath, ["--import", "./register.mjs", "src/cli.ts"], {
    cwd: join(code, "packages/server"),
    env: {
      ...process.env,
      SPEAKKIT_PORT: "0",
      SPEAKKIT_ENGINE: "kokoro",
      SPEAKKIT_DATA_DIR: mkdtempSync(join(tmpdir(), "speakkit-real-")),
      SPEAKKIT_MODELS_DIR: join(code, ".cache/models"),
      ...o.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const line = await new Promise<string>((res, rej) => {
    let buf = "";
    child.stdout!.on("data", (d) => {
      buf += d;
      if (buf.includes("\n")) res(buf.split("\n")[0]!);
    });
    child.once("exit", (c) => rej(new Error(`server exited ${c}`)));
    setTimeout(() => rej(new Error("server did not start")), 30_000);
  });
  const { port, token } = JSON.parse(line) as { port: number; token: string };
  if (o.warm === false) return { port, token, pid: child.pid!, stop: stopper(child) };
  // The server loads the model lazily: ask for it, then wait until it is ready.
  await fetch(`http://127.0.0.1:${port}/v1/engine/warm`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const deadline = Date.now() + 90_000;
  for (;;) {
    const h = (await (await fetch(`http://127.0.0.1:${port}/v1/health`)).json()) as { engine: { state: string } };
    if (h.engine.state === "ready") break;
    if (h.engine.state === "error" || Date.now() > deadline) throw new Error(`engine state ${h.engine.state}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  return { port, token, pid: child.pid!, stop: stopper(child) };
}

const stopper = (child: ChildProcess) => () =>
  new Promise<void>((r) => {
    child.once("exit", () => r());
    child.kill();
    setTimeout(r, 3000);
  });
