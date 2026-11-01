import { describe, expect, it } from "vite-plus/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KokoroEngine } from "@speakkit/engine";
import { createServer } from "../src";
import { readFrames } from "./harness";

// Opt-in: SPEAKKIT_REAL=1. Numbers for docs/perf.md come from bench/lifecycle.ts.
const modelsDir = process.env.SPEAKKIT_MODELS_DIR ?? "D:/workspaces/speak-it/code/.cache/models";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!process.env.SPEAKKIT_REAL)("real model lifecycle", () => {
  it("starts unloaded, warms, serves, unloads after idle, and reloads on demand", async () => {
    const engine = new KokoroEngine({ modelsDir });
    const server = createServer({
      engine,
      dataDir: mkdtempSync(join(tmpdir(), "speakkit-life-")),
      port: 0,
      idleUnloadMs: 4000,
    });
    await server.listen();
    const base = `http://127.0.0.1:${server.port}`;
    const headers = { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" };
    const health = async () => ((await (await fetch(`${base}/v1/health`)).json()) as { engine: { state: string } }).engine.state;
    const speak = (text: string) =>
      fetch(`${base}/v1/speak`, {
        method: "POST",
        headers,
        body: JSON.stringify({ sentences: [text], voice: "af_heart", speed: 1 }),
      }).then(readFrames);
    try {
      expect(await health()).toBe("unloaded"); // model files are cached, nothing in RAM
      expect((await fetch(`${base}/v1/engine/warm`, { method: "POST", headers })).status).toBe(202);
      expect(["loading", "ready"]).toContain(await health());
      const first = await speak("Warm then speak.");
      expect(first.at(-1)!.frame.header.type).toBe("done");
      expect(await health()).toBe("ready");

      const pid = engine.workerPid; // the model lives in its own process, so unloading frees everything
      expect(pid).toBeGreaterThan(0);
      for (let i = 0; i < 40 && (await health()) !== "unloaded"; i++) await sleep(250);
      expect(await health()).toBe("unloaded");
      expect(engine.workerPid).toBeUndefined();
      expect(() => process.kill(pid!, 0)).toThrow(); // the process is gone

      const again = await speak("Back after an unload.");
      expect(again.map((f) => f.frame.header.type)).toEqual(["audio", "done"]);
      expect(await health()).toBe("ready");
    } finally {
      await server.close();
      await engine.close();
    }
  }, 120_000);
});
