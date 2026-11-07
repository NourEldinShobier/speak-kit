import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { KokoroEngine } from "../src";

const worker = join(import.meta.dirname, "fake-worker.mjs");
const engines: KokoroEngine[] = [];

function make() {
  const modelsDir = mkdtempSync(join(tmpdir(), "kk-"));
  const onnx = join(modelsDir, "onnx-community/Kokoro-82M-v1.0-ONNX/onnx");
  mkdirSync(onnx, { recursive: true });
  writeFileSync(join(onnx, "model_uint8.onnx"), "");
  const e = new KokoroEngine({ modelsDir, workerUrl: worker, isolation: "process", idleUnloadMs: 0 });
  engines.push(e);
  return e;
}
const speak = (e: KokoroEngine, text: string) => e.synthesize(text, { voice: "af_heart", speed: 1 });

afterEach(async () => {
  await Promise.all(engines.splice(0).map((e) => e.close()));
});

describe("model host as a child process", () => {
  it("synthesizes through the host", async () => {
    const e = make();
    const r = await speak(e, "hello");
    expect(r.pcm).toHaveLength(100);
    expect(e.workerPid).toBeTypeOf("number");
  });

  it("a host killed mid-stream rejects the request, unloads, and the next request starts a new host", async () => {
    const e = make();
    await speak(e, "warm up");
    const pid = e.workerPid!;
    const pending = speak(e, "hang until killed");
    pending.catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
    process.kill(pid);
    await expect(pending).rejects.toThrow(/worker exited with code/);
    await vi.waitFor(() => expect(e.status().state).toBe("unloaded"));
    expect((await speak(e, "again")).pcm).toHaveLength(100);
    expect(e.workerPid).not.toBe(pid);
  });

  it("stops restarting the host after three crashes in five minutes", async () => {
    const e = make();
    for (let i = 0; i < 3; i++) {
      await speak(e, "warm up");
      const pending = speak(e, "hang");
      pending.catch(() => {});
      await new Promise((r) => setTimeout(r, 50));
      process.kill(e.workerPid!);
      await expect(pending).rejects.toThrow(/worker exited/);
    }
    await vi.waitFor(() => expect(e.status().state).toBe("error"));
    await expect(speak(e, "no")).rejects.toThrow("engine is error");
  });
});
