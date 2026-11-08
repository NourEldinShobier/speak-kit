import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { EngineList, ExportJob, Health } from "@speakkit/protocol";
import { readFrames, start, type Ctx } from "./harness";

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});

const call = (c: Ctx, method: string, path: string, body?: unknown) =>
  fetch(`${c.base}${path}`, {
    method,
    headers: { ...c.auth, "Content-Type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });
const list = async (r: Response) => (await r.json()) as EngineList;
const health = async (c: Ctx) => ((await (await fetch(`${c.base}/v1/health`)).json()) as Health).engine;

describe("GET /v1/engines", () => {
  it("lists Kokoro alone", async () => {
    ctx = await start();
    expect(await list(await call(ctx, "GET", "/v1/engines"))).toEqual({ active: "kokoro", engines: [{ id: "kokoro", name: "Kokoro", state: "ready" }] });
  });

  it("requires the token", async () => {
    ctx = await start();
    expect((await fetch(`${ctx.base}/v1/engines`)).status).toBe(401);
  });

  it("has no routes for choosing, installing, cancelling or removing an engine, or for cloning a voice", async () => {
    ctx = await start();
    for (const [method, path] of [
      ["POST", "/v1/engines/select"],
      ["POST", "/v1/engines/kokoro/install"],
      ["POST", "/v1/engines/kokoro/cancel"],
      ["DELETE", "/v1/engines/kokoro"],
      ["POST", "/v1/voices/clone"],
      ["GET", "/v1/voices/cloned"],
    ] as const)
      expect((await call(ctx, method, path)).status, `${method} ${path}`).toBe(404);
  });
});

describe("POST /v1/export", () => {
  const wait = async (c: Ctx, id: string) => {
    for (;;) {
      const j = (await (await call(c, "GET", `/v1/export/${id}`)).json()) as ExportJob;
      if (j.state !== "running") return j;
      await new Promise((r) => setTimeout(r, 15));
    }
  };

  it("renders the sentences into one WAV with the gap between them", async () => {
    ctx = await start();
    const r = await call(ctx, "POST", "/v1/export", { sentences: ["a".repeat(50), "b".repeat(100)], voice: "af_heart", speed: 1, gapMs: 500 });
    expect(r.status).toBe(202);
    const created = (await r.json()) as ExportJob;
    expect(created).toMatchObject({ state: "running", total: 2 });
    const done = await wait(ctx, created.id);
    // 50 chars = 3 s, 100 chars = 6 s (FakeEngine 0.06 s/char), one 0.5 s gap
    expect(done).toEqual({ id: created.id, state: "done", done: 2, total: 2, durationMs: 9500 });
    const audio = await call(ctx, "GET", `/v1/export/${created.id}/audio`);
    expect(audio.headers.get("content-type")).toBe("audio/wav");
    const buf = Buffer.from(await audio.arrayBuffer());
    expect(buf.length).toBe(44 + 9.5 * 24000 * 2);
    expect(buf.toString("latin1", 0, 4)).toBe("RIFF");
    expect(buf.readUInt32LE(24)).toBe(24000);
    expect(buf.readUInt32LE(40)).toBe(9.5 * 24000 * 2);
    expect((await call(ctx, "DELETE", `/v1/export/${created.id}`)).status).toBe(204);
    expect((await call(ctx, "GET", `/v1/export/${created.id}`)).status).toBe(404);
  });

  it("reports progress while running, answers 409 for the audio, and cancels", async () => {
    ctx = await start({ latencyMs: 100 });
    const job = (await (await call(ctx, "POST", "/v1/export", { sentences: ["a", "b", "c", "d", "e", "f"], voice: "af_heart", speed: 1 })).json()) as ExportJob;
    await new Promise((r) => setTimeout(r, 250));
    const mid = (await (await call(ctx, "GET", `/v1/export/${job.id}`)).json()) as ExportJob;
    expect(mid.state).toBe("running");
    expect(mid.done).toBeGreaterThanOrEqual(1);
    expect(mid.done).toBeLessThan(6);
    expect((await call(ctx, "GET", `/v1/export/${job.id}/audio`)).status).toBe(409);
    expect((await call(ctx, "DELETE", `/v1/export/${job.id}`)).status).toBe(204);
    expect(ctx.engine.calls.length).toBeLessThan(6);
    expect((await call(ctx, "GET", `/v1/export/${job.id}`)).status).toBe(404);
  });

  it("reports a failing sentence as an error job", async () => {
    ctx = await start({ failOn: (t) => t.includes("boom") });
    const job = (await (await call(ctx, "POST", "/v1/export", { sentences: ["fine", "boom"], voice: "af_heart", speed: 1 })).json()) as ExportJob;
    expect(await wait(ctx, job.id)).toMatchObject({ state: "error", done: 1, error: "fake engine failure" });
  });

  it("validates like /v1/speak, with speed limited to 2", async () => {
    ctx = await start();
    const bad = async (b: object) => ((await (await call(ctx!, "POST", "/v1/export", b)).json()) as { error: { code: string; message: string } }).error;
    expect(await bad({ sentences: [], voice: "af_heart", speed: 1 })).toMatchObject({ code: "invalid-request" });
    expect((await bad({ sentences: ["x"], voice: "af_heart", speed: 3 })).message).toBe("speed: Invalid value: Expected <=2 but received 3");
    expect((await bad({ sentences: ["x"], voice: "nope", speed: 1 })).message).toContain("voice");
  });
});

describe("text normalization before synthesis", () => {
  it("Kokoro receives URLs, scaled currency and emoji rewritten; digits are left to its phonemizer", async () => {
    ctx = await start();
    const r = await call(ctx, "POST", "/v1/speak", { sentences: ["It costs $5M, see https://example.com/x 😀 on the 3rd."], voice: "af_heart", speed: 1 });
    await readFrames(r);
    expect(ctx.engine.calls.map((c) => c.text)).toEqual(["It costs 5 million dollars, see example dot com on the 3rd."]);
  });

  it("a sentence with nothing readable becomes silence, keeping the frame index", async () => {
    ctx = await start();
    const frames = await readFrames(await call(ctx, "POST", "/v1/speak", { sentences: ["😀🎉", "Hello."], voice: "af_heart", speed: 1 }));
    expect(frames.map((f) => f.frame.header)).toMatchObject([
      { type: "audio", index: 0, durationMs: 100 },
      { type: "audio", index: 1 },
      { type: "done", count: 2 },
    ]);
    expect(ctx.engine.calls.map((c) => c.text)).toEqual(["Hello."]);
  });
});

describe("leftovers of removed engines", () => {
  const dataDir = () => mkdtempSync(join(tmpdir(), "speakkit-leftovers-"));

  it("an engine.json that selects Chatterbox, or is not valid, loads as Kokoro without an error and is deleted", async () => {
    for (const content of ['{"active":"chatterbox"}', "{not json", ""]) {
      const dir = dataDir();
      writeFileSync(join(dir, "engine.json"), content);
      ctx = await start({}, undefined, { dataDir: dir });
      expect((await list(await call(ctx, "GET", "/v1/engines"))).active).toBe("kokoro");
      expect((await health(ctx)).id).toBe("kokoro");
      await vi.waitFor(() => expect(existsSync(join(dir, "engine.json"))).toBe(false));
      expect(existsSync(join(dir, "engine.json.bad"))).toBe(false);
      await ctx.server.close();
      ctx = undefined;
    }
  });

  it("the engine folder and the cloned voices of earlier versions are deleted at start, the rest of the data folder stays", async () => {
    const dir = dataDir();
    for (const [folder, file] of [
      ["engines/chatterbox", "installed"],
      ["chatterbox", "installed"],
      ["voices", "cb_0a1b2c3d.wav"],
      ["library", "library.json"],
    ] as const) {
      mkdirSync(join(dir, folder), { recursive: true });
      writeFileSync(join(dir, folder, file), "x");
    }
    ctx = await start({}, undefined, { dataDir: dir });
    await vi.waitFor(() => expect(["engines/chatterbox", "chatterbox", "voices"].map((p) => existsSync(join(dir, p)))).toEqual([false, false, false]));
    expect(existsSync(join(dir, "library", "library.json"))).toBe(true);
  });
});
