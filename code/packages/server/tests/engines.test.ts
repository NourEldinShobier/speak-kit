import { request } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ClonedVoice, EngineList, ExportJob, Health, VoiceList } from "@speakkit/protocol";
import { ChatterboxEngine, FakeEngine, type Hardware } from "@speakkit/engine";
import { clip } from "../../engine/tests/clip-fixture";
import { readFrames, speakBody, start, type Ctx } from "./harness";

const sidecar = { command: process.execPath, args: [join(import.meta.dirname, "../../engine/tests/fake-sidecar.mjs")] };
const GPU = { name: "RTX 4080", vramMb: 12282 };

let ctx: Ctx | undefined;
const toClose: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
  await Promise.all(toClose.splice(0).map((e) => e.close()));
});

function chatterbox(hw: Hardware, installed = true, installer?: () => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "cbs-"));
  if (installed) {
    mkdirSync(join(root, "chatterbox"));
    writeFileSync(join(root, "chatterbox", "installed"), "x");
  }
  const e = new ChatterboxEngine({ dir: join(root, "chatterbox"), voicesDir: join(root, "voices"), sidecar, idleUnloadMs: 0, ...(installer && { installer }) }, hw);
  toClose.push(e);
  return e;
}
const startWith = (cb: ChatterboxEngine, opts: ConstructorParameters<typeof FakeEngine>[0] = {}) => start(opts, undefined, { chatterbox: cb });

const call = (c: Ctx, method: string, path: string, body?: unknown) =>
  fetch(`${c.base}${path}`, {
    method,
    headers: { ...c.auth, "Content-Type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });
const list = async (r: Response) => (await r.json()) as EngineList;
const health = async (c: Ctx) => ((await (await fetch(`${c.base}/v1/health`)).json()) as Health).engine;

describe("GET /v1/engines", () => {
  it("lists Kokoro alone when there is no second engine", async () => {
    ctx = await start();
    expect(await list(await call(ctx, "GET", "/v1/engines"))).toEqual({
      active: "kokoro",
      engines: [{ id: "kokoro", name: "Kokoro", state: "ready", optional: false, cloning: false }],
    });
  });

  it("reports why Chatterbox is unavailable, and refuses to select or install it", async () => {
    ctx = await startWith(chatterbox({ python: ["python"] }, false));
    const l = await list(await call(ctx, "GET", "/v1/engines"));
    expect(l.engines[1]).toMatchObject({ id: "chatterbox", state: "unavailable", reason: "no-gpu", optional: true, cloning: true });
    for (const [method, path, body] of [
      ["POST", "/v1/engines/select", { id: "chatterbox" }],
      ["POST", "/v1/engines/chatterbox/install"],
    ] as const) {
      const r = await call(ctx, method, path, body);
      expect(r.status).toBe(409);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe("engine-unavailable");
    }
  });

  it("requires the token", async () => {
    ctx = await start();
    expect((await fetch(`${ctx.base}/v1/engines`)).status).toBe(401);
  });
});

describe("install, select, remove", () => {
  it("installs with progress, selects (persisted), speaks with Chatterbox and unloads Kokoro", async () => {
    let finish!: () => void;
    const cb = chatterbox({ gpu: GPU, python: ["python"] }, false, () => new Promise<void>((r) => (finish = r)));
    ctx = await startWith(cb, { state: "ready" });
    const accepted = await call(ctx, "POST", "/v1/engines/chatterbox/install");
    expect(accepted.status).toBe(202);
    expect((await list(accepted)).engines[1]!.state).toBe("installing");
    expect((await call(ctx, "POST", "/v1/engines/select", { id: "chatterbox" })).status).toBe(409); // still installing
    await vi.waitFor(() => expect(finish).toBeDefined()); // the installer starts after the disk-space check
    finish();
    while ((await list(await call(ctx, "GET", "/v1/engines"))).engines[1]!.state === "installing") await new Promise((r) => setTimeout(r, 10));

    const sel = await list(await call(ctx, "POST", "/v1/engines/select", { id: "chatterbox" }));
    expect(sel.active).toBe("chatterbox");
    expect(ctx.engine.status().state).toBe("unloaded"); // only one heavy engine loaded
    expect((await health(ctx)).id).toBe("chatterbox");
    const voices = (await (await call(ctx, "GET", "/v1/voices")).json()) as VoiceList;
    expect(voices).toMatchObject({ default: "chatterbox", voices: [{ id: "chatterbox" }] });

    const r = await fetch(`${ctx.base}/v1/speak`, {
      method: "POST",
      headers: { ...ctx.auth, "Content-Type": "application/json" },
      body: JSON.stringify({ sentences: ["hello"], voice: "chatterbox", speed: 1 }),
    });
    const frames = await readFrames(r);
    expect(frames.map((f) => f.frame.header.type)).toEqual(["audio", "done"]);
    expect(cb.status().state).toBe("ready");
    expect(ctx.engine.calls).toEqual([]);

    const back = await list(await call(ctx, "POST", "/v1/engines/select", { id: "kokoro" }));
    expect(back.active).toBe("kokoro");
    expect(cb.status().state).toBe("unloaded"); // Chatterbox unloaded when Kokoro takes over
  });

  it("cancels running streams when the engine is switched", async () => {
    ctx = await startWith(chatterbox({ gpu: GPU }), { latencyMs: 200 });
    const stream = fetch(`${ctx.base}/v1/speak`, { method: "POST", headers: { ...ctx.auth, "Content-Type": "application/json" }, body: speakBody(["a", "b", "c", "d"]) }).then(readFrames);
    await new Promise((r) => setTimeout(r, 80));
    await call(ctx, "POST", "/v1/engines/select", { id: "chatterbox" });
    expect((await stream).map((f) => f.frame.header.type)).not.toContain("done");
  });

  it("removes Chatterbox, falling back to Kokoro; Kokoro cannot be removed", async () => {
    const cb = chatterbox({ gpu: GPU, python: ["python"] });
    ctx = await startWith(cb);
    await call(ctx, "POST", "/v1/engines/select", { id: "chatterbox" });
    const l = await list(await call(ctx, "DELETE", "/v1/engines/chatterbox"));
    expect(l.active).toBe("kokoro");
    expect(l.engines[1]).toMatchObject({ state: "missing", reason: "not-installed" });
    const k = await call(ctx, "DELETE", "/v1/engines/kokoro");
    expect(k.status).toBe(400);
  });
});

describe("persisted selection", () => {
  it("is restored by the next server on the same data directory", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "persist-"));
    const make = () => start({}, undefined, { chatterbox: chatterbox({ gpu: GPU }), dataDir });
    ctx = await make();
    await call(ctx, "POST", "/v1/engines/select", { id: "chatterbox" });
    await ctx.server.close();
    ctx = await make();
    expect((await list(await call(ctx, "GET", "/v1/engines"))).active).toBe("chatterbox");
    await ctx.server.close();
    ctx = await start({}, undefined, { chatterbox: chatterbox({}, false), dataDir }); // GPU gone
    expect((await list(await call(ctx, "GET", "/v1/engines"))).active).toBe("kokoro");
  });
});

describe("voice cloning", () => {
  const body = (wav: Buffer, extra: object = {}) => ({ name: "Maya", consent: true, audio: wav.toString("base64"), ...extra });

  it("clones a good clip, lists it as a voice, speaks with it and deletes it", async () => {
    ctx = await startWith(chatterbox({ gpu: GPU }));
    const r = await call(ctx, "POST", "/v1/voices/clone", body(clip(8)));
    expect(r.status).toBe(201);
    const voice = (await r.json()) as ClonedVoice;
    expect(voice).toMatchObject({ name: "Maya", durationMs: 8000 });
    expect(voice.id).toMatch(/^cb_[0-9a-f]{8}$/);
    expect(voice.checks.every((c) => c.ok)).toBe(true);
    expect(((await (await call(ctx, "GET", "/v1/voices/cloned")).json()) as { voices: ClonedVoice[] }).voices.map((v) => v.id)).toEqual([voice.id]);

    await call(ctx, "POST", "/v1/engines/select", { id: "chatterbox" });
    const voices = (await (await call(ctx, "GET", "/v1/voices")).json()) as VoiceList;
    expect(voices.voices.map((v) => v.id)).toEqual(["chatterbox", voice.id]);
    expect(voices.voices[1]).toMatchObject({ cloned: true });
    const s = await fetch(`${ctx.base}/v1/speak`, {
      method: "POST",
      headers: { ...ctx.auth, "Content-Type": "application/json" },
      body: JSON.stringify({ sentences: ["hi"], voice: voice.id, speed: 1 }),
    });
    expect((await readFrames(s)).map((f) => f.frame.header.type)).toEqual(["audio", "done"]);

    expect((await call(ctx, "DELETE", `/v1/voices/${voice.id}`)).status).toBe(204);
    expect((await call(ctx, "DELETE", `/v1/voices/${voice.id}`)).status).toBe(404);
  });

  it("renames a cloned voice, stores its style and speaks with it", async () => {
    ctx = await startWith(chatterbox({ gpu: GPU }));
    const voice = (await (await call(ctx, "POST", "/v1/voices/clone", body(clip(8)))).json()) as ClonedVoice;
    const r = await call(ctx, "PATCH", `/v1/voices/${voice.id}`, { name: "Maya R", exaggeration: 0.7, pace: 0.4 });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id: voice.id, name: "Maya R", exaggeration: 0.7, pace: 0.4 });
    expect(((await (await call(ctx, "GET", "/v1/voices/cloned")).json()) as { voices: ClonedVoice[] }).voices[0]).toMatchObject({ name: "Maya R", exaggeration: 0.7, pace: 0.4 });
    await call(ctx, "POST", "/v1/engines/select", { id: "chatterbox" });
    const s = await fetch(`${ctx.base}/v1/speak`, {
      method: "POST",
      headers: { ...ctx.auth, "Content-Type": "application/json" },
      body: JSON.stringify({ sentences: ["hi"], voice: voice.id, speed: 1 }),
    });
    const [first] = await readFrames(s);
    expect(first!.frame.pcm![0]).toBe(2000 + 700 + 4000); // fake sidecar: reference 2000, 1000 x exaggeration, 10 000 x pace
  });

  it("refuses an empty, out-of-range or unknown update", async () => {
    ctx = await startWith(chatterbox({ gpu: GPU }));
    const voice = (await (await call(ctx, "POST", "/v1/voices/clone", body(clip(8)))).json()) as ClonedVoice;
    const patch = async (id: string, b: object) => {
      const r = await call(ctx!, "PATCH", `/v1/voices/${id}`, b);
      return [r.status, ((await r.json()) as { error: { message: string } }).error.message];
    };
    expect(await patch(voice.id, {})).toEqual([400, "body: give a name, an exaggeration or a pace"]);
    expect((await patch(voice.id, { pace: 1.5 }))[0]).toBe(400);
    expect(await patch("cb_00000000", { name: "x" })).toEqual([404, "no such cloned voice"]);
  });

  it("changes nothing after the client saw 504: a rename body that arrives late is not applied", async () => {
    const cb = chatterbox({ gpu: GPU });
    const voice = await cb.clones.create({ name: "Voice 1", wav: clip(8), durationMs: 8000, checks: [] });
    ctx = await start({}, undefined, { chatterbox: cb, controlDeadlineMs: 80 });
    const body = JSON.stringify({ name: "Late name" });
    const req = request({
      host: "127.0.0.1",
      port: ctx.server.port,
      method: "PATCH",
      path: `/v1/voices/${voice.id}`,
      headers: { ...ctx.auth, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    });
    req.on("error", () => {}); // the server may drop the connection once it has answered
    const status = new Promise<number>((resolve) => req.on("response", (r) => (r.resume(), resolve(r.statusCode!))));
    req.write(body.slice(0, 5));
    expect(await status).toBe(504);
    req.end(body.slice(5));
    await new Promise((r) => setTimeout(r, 200));
    expect(cb.clones.list().map((v) => v.name)).toEqual(["Voice 1"]);
  });

  it.each([
    ["too short", clip(3), "Clip is 3.0 s; at least 5.0 s is needed.", "length"],
    ["too long", clip(31), "Clip is 31.0 s; at most 30.0 s is allowed.", "length"],
    ["low sample rate", clip(8, 8000), "Sample rate is 8000 Hz; at least 16000 Hz is needed.", "sample-rate"],
  ])("rejects a clip that is %s with the failing check", async (_, wav, message, id) => {
    ctx = await startWith(chatterbox({ gpu: GPU }));
    const r = await call(ctx, "POST", "/v1/voices/clone", body(wav));
    expect(r.status).toBe(422);
    const e = (await r.json()) as { error: { code: string; message: string; checks: { id: string; ok: boolean }[] } };
    expect(e.error).toMatchObject({ code: "clip-rejected", message });
    expect(e.error.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([id]);
  });

  it("rejects silence, noise and files that are not WAV", async () => {
    ctx = await startWith(chatterbox({ gpu: GPU }));
    const fail = async (b: object) => ((await (await call(ctx!, "POST", "/v1/voices/clone", b)).json()) as { error: { message: string; checks?: { id: string; ok: boolean }[] } }).error;
    expect((await fail(body(clip(8, 24000, { amp: 0, floor: 0 })))).checks!.filter((c) => !c.ok).map((c) => c.id)).toEqual(["loudness", "silence", "noise"]);
    expect((await fail(body(clip(8, 24000, { floor: 0.12, speechShare: 1 })))).checks!.find((c) => c.id === "noise")!.ok).toBe(false);
    expect((await fail(body(Buffer.from("ID3".padEnd(100, "x"))))).message).toBe("not a WAV file");
  });

  it("needs consent, a name and an installed engine", async () => {
    ctx = await startWith(chatterbox({ gpu: GPU }));
    const bad = async (b: object) => {
      const r = await call(ctx!, "POST", "/v1/voices/clone", b);
      return [r.status, ((await r.json()) as { error: { message: string } }).error.message];
    };
    expect(await bad(body(clip(8), { consent: false }))).toEqual([400, "consent: consent must be true: the speaker has to agree to being cloned"]);
    expect((await bad(body(clip(8), { name: "  " })))[0]).toBe(400);
    await ctx.server.close();
    ctx = await startWith(chatterbox({ gpu: GPU }, false));
    expect(await bad(body(clip(8)))).toEqual([409, "Install Chatterbox to clone voices"]);
    await ctx.server.close();
    ctx = await start();
    expect((await bad(body(clip(8))))[0]).toBe(409);
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

describe("engine.json that cannot be read", () => {
  const dataDir = (content?: string) => {
    const dir = mkdtempSync(join(tmpdir(), "speakkit-engine-json-"));
    if (content !== undefined) writeFileSync(join(dir, "engine.json"), content);
    return dir;
  };

  it.each([
    ["is not JSON", "{not json"],
    ["has the wrong shape", '{"active":"piper"}'],
    ["is empty", ""],
  ])("a file that %s is moved to engine.json.bad and Kokoro stays active", async (_, content) => {
    const dir = dataDir(content);
    ctx = await start({}, undefined, { dataDir: dir });
    expect((await list(await call(ctx, "GET", "/v1/engines"))).active).toBe("kokoro");
    expect(readFileSync(join(dir, "engine.json.bad"), "utf8")).toBe(content);
    expect(existsSync(join(dir, "engine.json"))).toBe(false);
  });

  it("a missing file leaves no .bad file", async () => {
    const dir = dataDir();
    ctx = await start({}, undefined, { dataDir: dir });
    expect(existsSync(join(dir, "engine.json.bad"))).toBe(false);
  });

  it("selecting an engine afterwards writes a fresh engine.json", async () => {
    const dir = dataDir("{not json");
    ctx = await start({}, undefined, { dataDir: dir, chatterbox: chatterbox({ gpu: GPU }) });
    await call(ctx, "POST", "/v1/engines/select", { id: "chatterbox" });
    expect(JSON.parse(readFileSync(join(dir, "engine.json"), "utf8"))).toEqual({ active: "chatterbox" });
    expect(readFileSync(join(dir, "engine.json.bad"), "utf8")).toBe("{not json");
  });
});
