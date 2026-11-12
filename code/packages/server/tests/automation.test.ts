import { afterEach, describe, expect, it } from "vite-plus/test";
import type { AutomationExport, AutomationQueue, AutomationSpeakRequest, AutomationStatus } from "@speakkit/protocol";
import { AutomationFault, type AutomationHost } from "../src";
import { start, type Ctx } from "./harness";

const IDLE: AutomationStatus = { status: "idle", title: "", index: 0, total: 0, elapsedMs: 0, totalMs: 0, queued: 0 };

/** A host with one reading and the calls it received; `fault` makes the next speak or export refuse. */
function fakeHost() {
  const h = {
    status: { ...IDLE } as AutomationStatus,
    spoken: [] as AutomationSpeakRequest[],
    stops: [] as boolean[],
    fault: undefined as AutomationFault | undefined,
    listeners: new Set<(s: AutomationStatus) => void>(),
    push(s: AutomationStatus) {
      h.status = s;
      for (const l of h.listeners) l(s);
    },
    api: {} as AutomationHost,
  };
  h.api = {
    status: () => h.status,
    queue: (): AutomationQueue => ({ current: null, items: [{ id: "q1", title: "next", chars: 4, addedAtMs: 1 }] }),
    speak: async (req) => {
      if (h.fault) throw h.fault;
      h.spoken.push(req);
      return { id: req.dryRun ? "" : "r1", position: 0, sentences: 1, estimatedMs: 500, ...(req.dryRun && { parts: [req.text] }) };
    },
    stop: (clear) => (h.stops.push(clear), h.status),
    startExport: async (): Promise<AutomationExport> => {
      if (h.fault) throw h.fault;
      return { id: "e1", stage: "rendering", progress: 0 };
    },
    exportStatus: (id) => (id === "e1" ? { id, stage: "done", progress: 1, path: "C:/x.mp3" } : undefined),
    subscribe: (l) => (h.listeners.add(l), () => h.listeners.delete(l)),
  };
  return h;
}

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});
const open = async (host?: ReturnType<typeof fakeHost>, extra = {}) => (ctx = await start({}, undefined, { ...(host && { automation: host.api }), ...extra }));
const call = (c: Ctx, path: string, method = "GET", body?: unknown) =>
  fetch(`${c.base}${path}`, { method, headers: { ...c.auth, ...(body !== undefined && { "Content-Type": "application/json" }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });

describe("limits and capabilities", () => {
  it("lists the server limits with the values it runs under", async () => {
    const c = await open(undefined, { maxStreams: 1, maxQueue: 3, streamIdleMs: 4000, controlDeadlineMs: 2000, heartbeatMs: 1000 });
    expect(await (await call(c, "/v1/limits")).json()).toEqual({
      maxStreams: 1,
      maxWaiting: 3,
      maxTextChars: 100_000,
      maxQueued: 20,
      maxSubscribers: 4,
      heartbeatMs: 1000,
      controlDeadlineMs: 2000,
      streamIdleMs: 4000,
    });
  });
  it("says what this version can do, with the typed error codes", async () => {
    const c = await open();
    const body = (await (await call(c, "/v1/capabilities")).json()) as { version: string; commands: Record<string, string>; errors: { code: string }[] };
    expect(body.version).toBe("9.9.9");
    expect(body.commands).toMatchObject({ speak: "available", "live-stream": "parked" });
    expect(body.errors.map((e) => e.code)).toContain("too_large");
  });
  it("needs the token", async () => {
    const c = await open();
    expect((await fetch(`${c.base}/v1/limits`)).status).toBe(401);
    expect((await fetch(`${c.base}/v1/capabilities`, { headers: { Authorization: "Bearer nope" } })).status).toBe(401);
  });
});

describe("without a host app", () => {
  it.each<[string, string, unknown?]>([
    ["GET", "/v1/automation/status"],
    ["GET", "/v1/automation/queue"],
    ["POST", "/v1/automation/speak", { text: "hi" }],
    ["POST", "/v1/automation/stop", {}],
    ["GET", "/v1/automation/events"],
  ])("%s %s answers unsupported", async (method, path, body) => {
    const c = await open();
    const r = await call(c, path, method, body);
    expect(r.status).toBe(501);
    expect(await r.json()).toMatchObject({ code: "unsupported" });
  });
});

describe("status, queue and stop", () => {
  it("answers the status and the queue", async () => {
    const h = fakeHost();
    h.status = { ...IDLE, status: "playing", title: "Hello", total: 2, queued: 1 };
    const c = await open(h);
    expect(await (await call(c, "/v1/automation/status")).json()).toEqual(h.status);
    expect(await (await call(c, "/v1/automation/queue")).json()).toEqual({ current: null, items: [{ id: "q1", title: "next", chars: 4, addedAtMs: 1 }] });
  });
  it("stops, with or without clearing the waiting list, and tolerates an empty body", async () => {
    const h = fakeHost();
    const c = await open(h);
    expect((await call(c, "/v1/automation/stop", "POST", {})).status).toBe(200);
    expect((await call(c, "/v1/automation/stop", "POST", { clear: true })).status).toBe(200);
    expect((await call(c, "/v1/automation/stop", "POST")).status).toBe(200);
    expect(h.stops).toEqual([false, true, false]);
  });
  it("refuses a stop body it does not know", async () => {
    const c = await open(fakeHost());
    const r = await call(c, "/v1/automation/stop", "POST", { clear: "yes" });
    expect([r.status, await r.json()]).toEqual([400, expect.objectContaining({ code: "invalid_input" })]);
  });
});

describe("speak", () => {
  it("starts a reading and passes the mode through", async () => {
    const h = fakeHost();
    const c = await open(h);
    const r = await call(c, "/v1/automation/speak", "POST", { text: "Hello there.", mode: "queue" });
    expect([r.status, await r.json()]).toEqual([202, { id: "r1", position: 0, sentences: 1, estimatedMs: 500 }]);
    expect(h.spoken).toEqual([{ text: "Hello there.", mode: "queue" }]);
  });
  it("answers a dry run with the parts and speaks nothing aloud", async () => {
    const h = fakeHost();
    const c = await open(h);
    const r = await call(c, "/v1/automation/speak", "POST", { text: "One.", dryRun: true });
    expect(await r.json()).toMatchObject({ id: "", parts: ["One."] });
  });
  it.each([[""], ["   \n"]])("refuses empty text %j as invalid_input without asking the host", async (text) => {
    const h = fakeHost();
    const c = await open(h);
    const r = await call(c, "/v1/automation/speak", "POST", { text });
    expect([r.status, ((await r.json()) as { code: string }).code]).toEqual([400, "invalid_input"]);
    expect(h.spoken).toEqual([]);
  });
  it("refuses text over the limit as too_large with HTTP 413", async () => {
    const h = fakeHost();
    const c = await open(h);
    const r = await call(c, "/v1/automation/speak", "POST", { text: "a".repeat(100_001) });
    expect([r.status, ((await r.json()) as { code: string }).code]).toEqual([413, "too_large"]);
    expect(h.spoken).toEqual([]);
  });
  it("accepts text of exactly the limit", async () => {
    const c = await open(fakeHost());
    expect((await call(c, "/v1/automation/speak", "POST", { text: "a".repeat(100_000) })).status).toBe(202);
  });
  it.each([[{ text: 5 }], [{ text: "x", mode: "now" }], [{ text: "x", voice: "af" }], [{}], [[]]])("refuses the body %j", async (body) => {
    const c = await open(fakeHost());
    expect((await call(c, "/v1/automation/speak", "POST", body)).status).toBe(400);
  });
  it("refuses a body that is not JSON", async () => {
    const c = await open(fakeHost());
    const r = await fetch(`${c.base}/v1/automation/speak`, { method: "POST", headers: c.auth, body: "{nope" });
    expect(r.status).toBe(400);
  });
  it.each([
    ["queue_full", 429],
    ["model_missing", 409],
    ["busy", 409],
    ["permission_denied", 403],
  ] as const)("turns a host refusal %s into HTTP %i with its code", async (code, status) => {
    const h = fakeHost();
    h.fault = new AutomationFault(code);
    const c = await open(h);
    const r = await call(c, "/v1/automation/speak", "POST", { text: "x" });
    expect(r.status).toBe(status);
    expect(await r.json()).toMatchObject({ code, error: { code } });
    if (code === "queue_full") expect(r.headers.get("retry-after")).toBe("1");
  });
  it("shows a host message when it gives one", async () => {
    const h = fakeHost();
    h.fault = new AutomationFault("busy", "a meeting is recording");
    const c = await open(h);
    expect(await (await call(c, "/v1/automation/speak", "POST", { text: "x" })).json()).toMatchObject({ error: { message: "a meeting is recording" } });
  });
  it("answers 500 for a failure that is not a refusal and keeps serving", async () => {
    const h = fakeHost();
    h.api.speak = async () => {
      throw new Error("boom");
    };
    const c = await open(h);
    expect((await call(c, "/v1/automation/speak", "POST", { text: "x" })).status).toBe(500);
    expect((await call(c, "/v1/automation/status")).status).toBe(200);
  });
});

describe("export", () => {
  it("starts and reports an export", async () => {
    const c = await open(fakeHost());
    expect(await (await call(c, "/v1/automation/export", "POST", { text: "hello", out: "C:/x.mp3" })).json()).toEqual({ id: "e1", stage: "rendering", progress: 0 });
    expect(await (await call(c, "/v1/automation/export/e1")).json()).toEqual({ id: "e1", stage: "done", progress: 1, path: "C:/x.mp3" });
  });
  it("404 for an unknown export and 400 for an empty text", async () => {
    const c = await open(fakeHost());
    expect((await call(c, "/v1/automation/export/zzz")).status).toBe(404);
    expect((await call(c, "/v1/automation/export", "POST", { text: " ", out: "C:/x.mp3" })).status).toBe(400);
  });
});

/** Reads the event stream until `until(text)` holds or it ends. */
async function readEvents(res: Response, until: (text: string) => boolean): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = "";
  while (!until(text)) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value);
  }
  await reader.cancel();
  return text;
}

describe("event stream", () => {
  it("sends the status now and after each change", async () => {
    const h = fakeHost();
    const c = await open(h);
    const res = await call(c, "/v1/automation/events");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    setTimeout(() => h.push({ ...IDLE, status: "playing", title: "Hi", total: 1 }), 20);
    const text = await readEvents(res, (t) => t.includes('"playing"'));
    const events = text.split("\n\n").filter((e) => e.startsWith("event: status"));
    expect(events.map((e) => (JSON.parse(e.split("data: ")[1]!) as AutomationStatus).status)).toEqual(["idle", "playing"]);
  });
  it("sends a heartbeat comment while nothing changes", async () => {
    const c = await open(fakeHost(), { heartbeatMs: 30 });
    const text = await readEvents(await call(c, "/v1/automation/events"), (t) => t.includes(": hb"));
    expect(text).toContain(": hb\n\n");
  });
  it("lets go of the host when the client leaves", async () => {
    const h = fakeHost();
    const c = await open(h);
    const res = await call(c, "/v1/automation/events");
    await readEvents(res, (t) => t.includes("idle"));
    await new Promise((r) => setTimeout(r, 50));
    expect(h.listeners.size).toBe(0);
  });
  it("refuses a fifth stream with 429 and takes it again after one closes", async () => {
    const h = fakeHost();
    const c = await open(h);
    const open4 = await Promise.all([1, 2, 3, 4].map(() => call(c, "/v1/automation/events")));
    const fifth = await call(c, "/v1/automation/events");
    expect(fifth.status).toBe(429);
    expect(fifth.headers.get("retry-after")).toBe("5");
    await open4[0]!.body!.cancel();
    await new Promise((r) => setTimeout(r, 50));
    const again = await call(c, "/v1/automation/events");
    expect(again.status).toBe(200);
    await again.body!.cancel();
    for (const r of open4.slice(1)) await r.body!.cancel();
  });
  it("ends every stream when the server closes", async () => {
    const h = fakeHost();
    const c = await open(h);
    const res = await call(c, "/v1/automation/events");
    await readEvents(res, (t) => t.includes("idle"));
    const again = await call(c, "/v1/automation/events");
    const done = again.body!.getReader().read();
    await c.server.close();
    ctx = undefined;
    await expect(done.then((r) => r.done || r.value)).resolves.toBeDefined();
    await new Promise((r) => setTimeout(r, 30));
    expect(h.listeners.size).toBe(0);
  });
});
