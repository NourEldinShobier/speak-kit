import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { LOOK_ERROR_CODES, screenLookSchema, type LookErrorCode, type ScreenLook } from "@speakkit/protocol";
import type { LookResult, VoiceChatService } from "../src/voice-chat";
import { raw, start, type Ctx } from "./harness";

const LOOK: ScreenLook = { image: "/9j/4AAQ", width: 1280, height: 720, text: "Invoice 48213", ocr: "ok", target: "Notes", scope: "window" };
const KEY = "sk-proj-LONG_LIVED_KEY_must_never_leave_0123456789";

/** Records what the route handed to the service and answers with `result` after `ms`. */
function service(result: LookResult | Error = { ok: true, look: LOOK }, ms = 0) {
  const calls: { request: unknown; signal: AbortSignal }[] = [];
  const svc: VoiceChatService & { calls: typeof calls } = {
    calls,
    hasKey: async () => true,
    mint: async () => ({ ok: false, code: "unavailable" }),
    look: async (request, signal) => {
      calls.push({ request, signal });
      if (ms) await new Promise((r) => setTimeout(r, ms));
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return svc;
}

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});
const open = async (voiceChat?: VoiceChatService, serverOpts = {}) => (ctx = await start({}, undefined, { ...(voiceChat ? { voiceChat } : {}), ...serverOpts }));
const post = (c: Ctx, body: unknown = { session: "s1", scope: "window" }, headers = c.auth) =>
  fetch(`${c.base}/v1/voice-chat/look`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /v1/voice-chat/look", () => {
  it("passes the session and scope to the service and returns the look without caching", async () => {
    const svc = service();
    const c = await open(svc);
    const r = await post(c, { session: "conv-7", scope: "screen" });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await r.json();
    expect(body).toEqual(LOOK);
    expect(v.is(screenLookSchema, body)).toBe(true);
    expect(svc.calls.map((x) => x.request)).toEqual([{ session: "conv-7", scope: "screen" }]);
  });

  const CASES: [LookErrorCode, number][] = [
    ["declined", 403],
    ["no-window", 404],
    ["busy", 409],
    ["rate-limited", 429],
    ["unsupported", 501],
    ["capture-failed", 502],
    ["unavailable", 503],
    ["no-capture", 404],
  ];
  it("covers every error code of the protocol", () => {
    expect(CASES.map(([c]) => c)).toEqual([...LOOK_ERROR_CODES]);
  });
  for (const [code, status] of CASES)
    it(`maps ${code} to HTTP ${status} with the code in the body`, async () => {
      const c = await open(service({ ok: false, code }));
      const r = await post(c);
      expect(r.status).toBe(status);
      expect(await r.json()).toEqual({ code, error: { code, message: expect.any(String) } });
    });

  it("turns a failure of the service into capture-failed without its message", async () => {
    const c = await open(service(new Error(`boom with ${KEY}`)));
    const r = await post(c);
    expect(r.status).toBe(502);
    const text = await r.text();
    expect(JSON.parse(text).code).toBe("capture-failed");
    expect(text).not.toContain(KEY);
  });

  it("answers unavailable when the app cannot look", async () => {
    expect((await post(await open())).status).toBe(503);
    const svc = service();
    delete svc.look;
    expect((await post(await open(svc))).status).toBe(503);
  });

  it.each(["not json", "{}", JSON.stringify({ session: "s", scope: "desktop" }), JSON.stringify({ session: "", scope: "window" }), JSON.stringify({ session: "s".repeat(5000), scope: "window" })])(
    "rejects the body %s with 400 or 413 before the service is called",
    async (body) => {
      const svc = service();
      const r = await post(await open(svc), body);
      expect([400, 413]).toContain(r.status);
      expect(svc.calls).toHaveLength(0);
    },
  );

  it("allows 6 looks a minute, then 429 rate-limited with Retry-After and no service call", async () => {
    const svc = service();
    const c = await open(svc);
    for (let i = 0; i < 6; i++) expect((await post(c)).status).toBe(200);
    const r = await post(c);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await r.json()).code).toBe("rate-limited");
    expect(svc.calls).toHaveLength(6);
  });

  it("is not cut by the control deadline: the user may take a while to answer the consent card", async () => {
    const c = await open(service(undefined, 400), { controlDeadlineMs: 100 });
    expect((await post(c)).status).toBe(200);
  });

  it("aborts the service when the client goes away", async () => {
    const svc = service(undefined, 5000);
    const c = await open(svc);
    const pending = post(c).catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
    expect(svc.calls[0]?.signal.aborted).toBe(false);
    await c.server.close(); // drops the connection
    await pending;
    await vi.waitFor(() => expect(svc.calls[0]?.signal.aborted).toBe(true));
  });

  it("needs the token and refuses a web page origin", async () => {
    const svc = service();
    const c = await open(svc);
    expect((await post(c, undefined, {})).status).toBe(401);
    const r = await raw(c, "POST", "/v1/voice-chat/look", { Host: `127.0.0.1:${c.server.port}`, ...c.auth, Origin: "https://evil.example" }, JSON.stringify({ session: "s", scope: "window" }));
    expect(r.status).toBe(403);
    expect(svc.calls).toHaveLength(0);
  });
});
