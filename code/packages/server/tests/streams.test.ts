import { afterEach, describe, expect, it } from "vite-plus/test";
import type { StreamsHost } from "../src";
import { start, type Ctx } from "./harness";

const RATE = 16_000;
const pcm = (ms: number, amp: number) => Buffer.from(new Int16Array((RATE * ms) / 1000).fill(amp).buffer);
const phrase = () => Buffer.concat([pcm(1500, 9000), pcm(720, 0)]);

const host: StreamsHost = {
  transcribe: async () => ({ ok: true, text: "hello there", speech: true }),
  process: (text) => `${text}!`,
};

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});
const open = async (streams?: StreamsHost) => (ctx = await start({}, undefined, { ...(streams && { streams }) }));
const call = (c: Ctx, path: string, o: { method?: string; owner?: string; body?: BodyInit; json?: unknown } = {}) =>
  fetch(`${c.base}${path}`, {
    method: o.method ?? "GET",
    headers: { ...c.auth, ...(o.owner && { "X-Stream-Owner": o.owner }), ...(o.json !== undefined && { "Content-Type": "application/json" }) },
    ...(o.json !== undefined && { body: JSON.stringify(o.json) }),
    ...(o.body !== undefined && { body: o.body }),
  });
const create = async (c: Ctx, json: object = {}) => (await call(c, "/v1/streams", { method: "POST", json })).json() as Promise<{ id: string; owner: string; leaseMs: number }>;

describe("live transcription routes", () => {
  it("creates a stream, takes audio, and finishes with the text, the processed text and the times", async () => {
    const c = await open(host);
    const made = await create(c, { process: true, timestamps: true });
    expect(made).toMatchObject({ id: expect.any(String), owner: expect.any(String), leaseMs: 30_000 });
    const audio = await call(c, `/v1/streams/${made.id}/audio`, { method: "POST", owner: made.owner, body: phrase() });
    expect(audio.status).toBe(202);
    expect(await audio.json()).toEqual({ bytes: 71_040 });
    expect((await call(c, `/v1/streams/${made.id}/heartbeat`, { method: "POST", owner: made.owner })).status).toBe(200);
    const done = await call(c, `/v1/streams/${made.id}/finish`, { method: "POST", owner: made.owner });
    expect(await done.json()).toEqual({ text: "hello there", processed: "hello there!", segments: [{ n: 1, text: "hello there", startMs: 0, endMs: 2220 }] });
    expect((await call(c, `/v1/streams/${made.id}/finish`, { method: "POST", owner: made.owner })).status).toBe(404);
  });

  it("sends a finished segment as a server-sent event", async () => {
    const c = await open(host);
    const made = await create(c);
    const res = await call(c, `/v1/streams/${made.id}/events`, { owner: made.owner });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    await call(c, `/v1/streams/${made.id}/audio`, { method: "POST", owner: made.owner, body: phrase() });
    const reader = res.body!.getReader();
    let text = "";
    while (!text.includes("hello there")) text += new TextDecoder().decode((await reader.read()).value);
    expect(text).toBe('event: segment\ndata: {"n":1,"text":"hello there"}\n\n');
    await reader.cancel();
  });

  it("ends the event stream after done, and after a cancel, instead of leaving it open", async () => {
    const c = await open(host);
    const finished = await create(c);
    const res = await call(c, `/v1/streams/${finished.id}/events`, { owner: finished.owner });
    await call(c, `/v1/streams/${finished.id}/audio`, { method: "POST", owner: finished.owner, body: phrase() });
    await call(c, `/v1/streams/${finished.id}/finish`, { method: "POST", owner: finished.owner });
    expect(await res.text()).toBe('event: segment\ndata: {"n":1,"text":"hello there"}\n\nevent: done\ndata: {"text":"hello there","segments":[{"n":1,"text":"hello there"}]}\n\n');
    const cancelled = await create(c);
    const open2 = await call(c, `/v1/streams/${cancelled.id}/events`, { owner: cancelled.owner });
    await call(c, `/v1/streams/${cancelled.id}`, { method: "DELETE", owner: cancelled.owner });
    expect(await open2.text()).toBe("");
  });

  it("refuses another program, a wrong chunk, an oversized body and a third stream, with typed errors", async () => {
    const c = await open(host);
    const made = await create(c);
    const wrong = await call(c, `/v1/streams/${made.id}/audio`, { method: "POST", owner: "nope", body: phrase() });
    expect([wrong.status, (await wrong.json()).code]).toEqual([403, "permission_denied"]);
    const odd = await call(c, `/v1/streams/${made.id}/audio`, { method: "POST", owner: made.owner, body: Buffer.alloc(3) });
    expect([odd.status, (await odd.json()).code]).toEqual([400, "invalid_input"]);
    const big = await call(c, `/v1/streams/${made.id}/audio`, { method: "POST", owner: made.owner, body: Buffer.alloc(1024 * 1024 + 2) });
    expect(big.status).toBe(413);
    expect((await call(c, "/v1/streams/none/audio", { method: "POST", owner: made.owner, body: phrase() })).status).toBe(404);
    expect((await call(c, "/v1/streams", { method: "POST", json: { process: "yes" } })).status).toBe(400);
    await create(c);
    const third = await call(c, "/v1/streams", { method: "POST", json: {} });
    expect([third.status, (await third.json()).code]).toEqual([429, "queue_full"]);
  });

  it("cancels a stream, and needs the app token like every route", async () => {
    const c = await open(host);
    const made = await create(c);
    expect(await (await call(c, `/v1/streams/${made.id}`, { method: "DELETE", owner: made.owner })).json()).toEqual({ cancelled: true });
    expect((await call(c, `/v1/streams/${made.id}/heartbeat`, { method: "POST", owner: made.owner })).status).toBe(404);
    expect((await fetch(`${c.base}/v1/streams`, { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("answers unsupported when the app lends no speech engine", async () => {
    const c = await open();
    const res = await call(c, "/v1/streams", { method: "POST", json: {} });
    expect([res.status, (await res.json()).code]).toEqual([501, "unsupported"]);
  });
});
