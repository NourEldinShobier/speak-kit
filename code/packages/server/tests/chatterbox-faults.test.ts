import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { EngineList } from "@speakkit/protocol";
import { ChatterboxEngine, InstallCancelledError, type Hardware } from "@speakkit/engine";
import { readFrames, start, type Ctx } from "./harness";

const GPU = { name: "RTX 4080", vramMb: 12282 };
const GB = 1024 ** 3;
const sidecar = { command: process.execPath, args: [join(import.meta.dirname, "../../engine/tests/fake-sidecar.mjs")] };

let ctx: Ctx | undefined;
const toClose: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
  await Promise.all(toClose.splice(0).map((e) => e.close()));
  delete process.env.SPEAKKIT_FAKE_PID_FILE;
});

function chatterbox(hw: Hardware, o: { installed?: boolean; installer?: ConstructorParameters<typeof ChatterboxEngine>[0]["installer"] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "cbsf-"));
  if (o.installed) {
    mkdirSync(join(root, "chatterbox"));
    writeFileSync(join(root, "chatterbox", "installed"), "x");
  }
  const e = new ChatterboxEngine(
    { dir: join(root, "chatterbox"), voicesDir: join(root, "voices"), sidecar, idleUnloadMs: 0, freeBytes: async () => 50 * GB, ...(o.installer && { installer: o.installer }) },
    hw,
  );
  toClose.push(e);
  return e;
}

const call = (c: Ctx, method: string, path: string, body?: unknown) =>
  fetch(`${c.base}${path}`, { method, headers: { ...c.auth, "Content-Type": "application/json" }, body: body === undefined ? null : JSON.stringify(body) });
const list = async (r: Response) => (await r.json()) as EngineList;
const speak = (c: Ctx, sentences: string[]) => call(c, "POST", "/v1/speak", { sentences, voice: "chatterbox", speed: 1 });
const types = (frames: Awaited<ReturnType<typeof readFrames>>) => frames.map((f) => f.frame.header.type);

async function withChatterboxActive(cb: ChatterboxEngine): Promise<Ctx> {
  const c = await start({}, undefined, { chatterbox: cb });
  await call(c, "POST", "/v1/engines/select", { id: "chatterbox" });
  return c;
}

describe("POST /v1/engines/chatterbox/cancel", () => {
  it("stops a running install and the engine is installable again", async () => {
    const cb = chatterbox({ gpu: GPU, python: ["python"] }, { installer: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new InstallCancelledError()))) });
    ctx = await start({}, undefined, { chatterbox: cb });
    const accepted = await list(await call(ctx, "POST", "/v1/engines/chatterbox/install"));
    expect(accepted.engines[1]!.state).toBe("installing");
    await vi.waitFor(() => expect(cb.status().state).toBe("installing"));
    const r = await call(ctx, "POST", "/v1/engines/chatterbox/cancel");
    expect(r.status).toBe(200);
    expect((await list(r)).engines[1]).toEqual({ id: "chatterbox", name: "Chatterbox", state: "missing", reason: "not-installed", optional: true, cloning: true, gpu: GPU });
  });

  it("does nothing for an engine that is not installing, and needs the token", async () => {
    ctx = await start({}, undefined, { chatterbox: chatterbox({ gpu: GPU }, { installed: true }) });
    expect((await list(await call(ctx, "POST", "/v1/engines/chatterbox/cancel"))).engines[1]!.state).toBe("unloaded");
    expect((await call(ctx, "POST", "/v1/engines/kokoro/cancel")).status).toBe(200);
    expect((await fetch(`${ctx.base}/v1/engines/chatterbox/cancel`, { method: "POST" })).status).toBe(401);
  });
});

describe("faults while speaking with Chatterbox", () => {
  it("out of GPU memory: the stream ends with a typed error, the engine says why, Kokoro still works and the next request retries", async () => {
    ctx = await withChatterboxActive(chatterbox({ gpu: GPU }, { installed: true }));
    const frames = await readFrames(await speak(ctx, ["first one", "an oom sentence", "never reached"]));
    expect(types(frames)).toEqual(["audio", "error"]);
    expect(frames[1]!.frame.header).toMatchObject({ type: "error", code: "synthesis-failed", message: expect.stringContaining("CUDA out of memory") });
    const l = await list(await call(ctx, "GET", "/v1/engines"));
    expect(l.engines[1]).toMatchObject({ state: "unloaded", reason: "out-of-memory", detail: expect.stringContaining("CUDA out of memory") });

    await call(ctx, "POST", "/v1/engines/select", { id: "kokoro" });
    expect(types(await readFrames(await call(ctx, "POST", "/v1/speak", { sentences: ["hello"], voice: "af_heart", speed: 1 })))).toEqual(["audio", "done"]);
    await call(ctx, "POST", "/v1/engines/select", { id: "chatterbox" });
    expect(types(await readFrames(await speak(ctx, ["fine now"])))).toEqual(["audio", "done"]);
    expect((await list(await call(ctx, "GET", "/v1/engines"))).engines[1]).not.toHaveProperty("reason");
  });

  it("the sidecar crashing mid-stream ends the stream with a typed error, unloads the engine, and the next request restarts it", async () => {
    ctx = await withChatterboxActive(chatterbox({ gpu: GPU }, { installed: true }));
    const frames = await readFrames(await speak(ctx, ["one", "now crash", "three"]));
    expect(types(frames)).toEqual(["audio", "error"]);
    expect(frames[1]!.frame.header).toMatchObject({ type: "error", code: "synthesis-failed", message: expect.stringContaining("exited with code 3") });
    expect((await list(await call(ctx, "GET", "/v1/engines"))).engines[1]!.state).toBe("unloaded");
    expect(types(await readFrames(await speak(ctx, ["again"])))).toEqual(["audio", "done"]);
  });

  it("switching to Kokoro during playback cancels the stream without an error frame and ends the sidecar process", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cbsf-pid-"));
    process.env.SPEAKKIT_FAKE_PID_FILE = join(dir, "pid");
    const cb = chatterbox({ gpu: GPU }, { installed: true });
    ctx = await withChatterboxActive(cb);
    const stream = speak(ctx, ["slow one", "slow two", "slow three", "slow four"]).then(readFrames);
    await vi.waitFor(() => expect(cb.status().state).toBe("ready"));
    const pid = Number(readFileSync(join(dir, "pid"), "utf8"));
    await new Promise((r) => setTimeout(r, 150)); // inside the first sentence
    const back = await list(await call(ctx, "POST", "/v1/engines/select", { id: "kokoro" }));
    expect(back.active).toBe("kokoro");
    const frames = await stream;
    expect(types(frames)).not.toContain("done");
    expect(types(frames)).not.toContain("error");
    expect(cb.status().state).toBe("unloaded");
    await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow());
  });
});
