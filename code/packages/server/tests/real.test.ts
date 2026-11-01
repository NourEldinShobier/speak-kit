import { describe, expect, it } from "vite-plus/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KokoroEngine } from "@speakkit/engine";
import { createServer } from "../src";
import { readFrames } from "./harness";

// Opt-in: SPEAKKIT_REAL=1. Downloads the model into SPEAKKIT_MODELS_DIR on the first run.
const modelsDir = process.env.SPEAKKIT_MODELS_DIR ?? "D:/workspaces/speak-it/code/.cache/models";

describe.skipIf(!process.env.SPEAKKIT_REAL)("server with the real Kokoro engine", () => {
  it("reports loading then ready, streams real speech, and cancels", async () => {
    const engine = new KokoroEngine({ modelsDir });
    const server = createServer({
      engine,
      dataDir: mkdtempSync(join(tmpdir(), "speakkit-real-")),
      port: 0,
    });
    await server.listen();
    const base = `http://127.0.0.1:${server.port}`;
    const headers = { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" };
    try {
      const starting = engine.start();
      const h0 = (await (await fetch(`${base}/v1/health`)).json()) as { engine: { state: string } };
      expect(["loading", "downloading"]).toContain(h0.engine.state);
      await starting;
      const h1 = (await (await fetch(`${base}/v1/health`)).json()) as { engine: { state: string } };
      expect(h1.engine.state).toBe("ready");

      const sentences = ["The quick brown fox jumps over the lazy dog.", "Speech comes back as one frame per sentence."];
      const t0 = performance.now();
      const frames = await readFrames(
        await fetch(`${base}/v1/speak`, {
          method: "POST",
          headers,
          body: JSON.stringify({ sentences, voice: "af_heart", speed: 1 }),
        }),
      );
      expect(frames[0]!.at - t0).toBeLessThan(5000);
      expect(frames.map((f) => f.frame.header.type)).toEqual(["audio", "audio", "done"]);
      for (const { frame } of frames.slice(0, 2)) {
        const pcm = frame.pcm!;
        expect(pcm.length).toBeGreaterThan(24000);
        let sum = 0;
        for (const v of pcm) sum += (v / 32768) ** 2;
        expect(Math.sqrt(sum / pcm.length)).toBeGreaterThan(0.01); // audible, not silence
      }

      // Disconnect mid-stream: the server must keep working afterwards.
      const ac = new AbortController();
      const res = await fetch(`${base}/v1/speak`, {
        method: "POST",
        headers,
        signal: ac.signal,
        body: JSON.stringify({
          sentences: Array(20).fill(sentences[0]),
          voice: "bf_emma",
          speed: 2.5,
        }),
      });
      await res.body!.getReader().read();
      ac.abort();
      const again = await readFrames(
        await fetch(`${base}/v1/speak`, {
          method: "POST",
          headers,
          body: JSON.stringify({ sentences: ["Still alive."], voice: "af_heart", speed: 1 }),
        }),
      );
      expect(again.at(-1)!.frame.header.type).toBe("done");
    } finally {
      await server.close();
      await engine.close();
    }
  }, 600_000);
});
