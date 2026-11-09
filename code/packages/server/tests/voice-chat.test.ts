import * as v from "valibot";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { VOICE_CHAT_ERROR_CODES, voiceChatErrorSchema, voiceChatSessionSchema, type VoiceChatErrorCode } from "@speakkit/protocol";
import { MintLimiter, type MintResult, type VoiceChatService } from "../src/voice-chat";
import { raw, start, type Ctx } from "./harness";

const API_KEY = "sk-proj-LONG_LIVED_KEY_must_never_leave_0123456789";
const SESSION = { clientSecret: "ek_abc123", expiresAt: 1_900_000_000, model: "gpt-realtime-2.1", voice: "marin" } as const;

/** A service that fails with a message containing the API key: the response must still not show it. */
function fakeService(result: MintResult | Error = { ok: true, session: SESSION }, hasKey = true): VoiceChatService & { mints: number } {
  const svc = {
    mints: 0,
    hasKey: async () => hasKey,
    mint: async () => {
      svc.mints++;
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
const open = async (voiceChat?: VoiceChatService) => (ctx = await start({}, undefined, voiceChat ? { voiceChat } : {}));
const post = (c: Ctx, headers = c.auth) => fetch(`${c.base}/v1/voice-chat/session`, { method: "POST", headers });

describe("GET /v1/voice-chat/status", () => {
  it("answers whether a key is saved", async () => {
    const c = await open(fakeService(undefined, true));
    const r = await fetch(`${c.base}/v1/voice-chat/status`, { headers: c.auth });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ hasKey: true });
  });

  it("says no key when the app has no voice chat service", async () => {
    const c = await open();
    expect(await (await fetch(`${c.base}/v1/voice-chat/status`, { headers: c.auth })).json()).toEqual({ hasKey: false });
  });
});

describe("POST /v1/voice-chat/session", () => {
  it("returns the client secret, expiry, model and voice, and nothing else", async () => {
    const svc = fakeService();
    const c = await open(svc);
    const r = await post(c);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const text = await r.text();
    expect(JSON.parse(text)).toEqual({ clientSecret: "ek_abc123", expiresAt: 1_900_000_000, model: "gpt-realtime-2.1", voice: "marin" });
    expect(text).not.toContain(API_KEY);
    expect(v.is(voiceChatSessionSchema, JSON.parse(text))).toBe(true);
  });

  const CASES: [VoiceChatErrorCode, number][] = [
    ["no-key", 409],
    ["key-rejected", 424],
    ["no-credit", 402],
    ["rate-limited", 429],
    ["offline", 503],
    ["unavailable", 502],
  ];
  it("covers every error code of the protocol", () => {
    expect(CASES.map(([c]) => c)).toEqual([...VOICE_CHAT_ERROR_CODES]);
  });
  for (const [code, status] of CASES)
    it(`maps ${code} to HTTP ${status} with the code in the body`, async () => {
      const c = await open(fakeService({ ok: false, code }));
      const r = await post(c);
      expect(r.status).toBe(status);
      const body = await r.json();
      expect(body).toEqual({ code, error: { code, message: expect.any(String) } });
      expect(v.is(voiceChatErrorSchema, body)).toBe(true);
    });

  it("turns a failure of the service into unavailable", async () => {
    const c = await open(fakeService(new Error(`boom with ${API_KEY}`)));
    const r = await post(c);
    expect(r.status).toBe(502);
    const text = await r.text();
    expect(JSON.parse(text).code).toBe("unavailable");
    expect(text).not.toContain(API_KEY);
  });

  it("answers 503 unavailable when the app has no voice chat service", async () => {
    const c = await open();
    const r = await post(c);
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("unavailable");
  });

  it("allows 10 mints a minute and then answers 429 rate-limited with Retry-After, without calling the service", async () => {
    const svc = fakeService();
    const c = await open(svc);
    for (let i = 0; i < 10; i++) expect((await post(c)).status).toBe(200);
    const r = await post(c);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await r.json()).code).toBe("rate-limited");
    expect(svc.mints).toBe(10);
  });

  it("needs the token on both routes", async () => {
    const svc = fakeService();
    const c = await open(svc);
    expect((await post(c, {})).status).toBe(401);
    expect((await fetch(`${c.base}/v1/voice-chat/status`)).status).toBe(401);
    expect(svc.mints).toBe(0);
  });

  it("refuses a web page origin", async () => {
    const svc = fakeService();
    const c = await open(svc);
    const r = await raw(c, "POST", "/v1/voice-chat/session", { Host: `127.0.0.1:${c.server.port}`, ...c.auth, Origin: "https://evil.example" });
    expect(r.status).toBe(403);
    expect(svc.mints).toBe(0);
  });
});

describe("MintLimiter", () => {
  it("frees a slot when the oldest attempt leaves the window", () => {
    let now = 0;
    const l = new MintLimiter(2, () => now);
    expect([l.take(), l.take(), l.take()]).toEqual([0, 0, 60]);
    now = 59_999;
    expect(l.take()).toBe(1);
    now = 60_000;
    expect(l.take()).toBe(0);
  });
});
