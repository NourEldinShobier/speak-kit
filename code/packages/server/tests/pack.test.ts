import { beforeAll, describe, expect, it } from "vite-plus/test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FrameDecoder } from "@speakkit/protocol";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

beforeAll(() => {
  const r = spawnSync("pnpm", ["exec", "vp", "pack"], { cwd: root, shell: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`vp pack failed:\n${r.stdout}\n${r.stderr}`);
}, 120_000);

describe("packed server (dist)", () => {
  it("emits the worker as its own file next to the server", () => {
    for (const f of ["index.js", "cli.js", "worker.js"]) expect(existsSync(join(dist, f))).toBe(true);
  });

  it("the packed CLI serves health, warm, voices and a speak stream with no TypeScript loader", async () => {
    const child = spawn(process.execPath, [join(dist, "cli.js")], {
      env: {
        ...process.env,
        SPEAKKIT_ENGINE: "fake",
        SPEAKKIT_FAKE_STATE: "unloaded",
        SPEAKKIT_PORT: "0",
        SPEAKKIT_DATA_DIR: mkdtempSync(join(tmpdir(), "speakkit-pack-")),
        SPEAKKIT_IDLE_MS: "60000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const line = await new Promise<string>((resolve, reject) => {
        let buf = "";
        let err = "";
        child.stderr.on("data", (d) => (err += d));
        child.stdout.on("data", (d) => {
          buf += d;
          if (buf.includes("\n")) resolve(buf.split("\n")[0]!);
        });
        child.on("exit", (c) => reject(new Error(`cli exited ${c}: ${err}`)));
      });
      const { port, token } = JSON.parse(line) as { port: number; token: string };
      const base = `http://127.0.0.1:${port}`;
      const auth = { Authorization: `Bearer ${token}` };

      const h = (await (await fetch(`${base}/v1/health`)).json()) as {
        app: string;
        engine: { state: string };
      };
      expect(h.app).toBe("speakkit");
      expect(h.engine.state).toBe("unloaded");
      expect((await fetch(`${base}/v1/engine/warm`, { method: "POST", headers: auth })).status).toBe(202);
      const res = await fetch(`${base}/v1/speak`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ sentences: ["Hello from the packed server."], voice: "af_heart", speed: 1 }),
      });
      const dec = new FrameDecoder();
      const types: string[] = [];
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) for (const f of dec.push(chunk)) types.push(f.header.type);
      expect(types).toEqual(["audio", "done"]);
      const h2 = (await (await fetch(`${base}/v1/health`)).json()) as {
        engine: { state: string; idleUnloadAtMs?: number };
      };
      expect(h2.engine.state).toBe("ready");
      expect(h2.engine.idleUnloadAtMs).toBeGreaterThan(Date.now());
    } finally {
      child.kill();
    }
  }, 60_000);

  it("rejects a malformed environment with a clear message", () => {
    const r = spawnSync(process.execPath, [join(dist, "cli.js")], {
      env: { ...process.env, SPEAKKIT_PORT: "abc", SPEAKKIT_ENGINE: "fake" },
      encoding: "utf8",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid environment: SPEAKKIT_PORT");
  });
});
