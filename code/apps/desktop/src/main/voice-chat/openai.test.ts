import { describe, expect, it } from "vite-plus/test";
import { mapFailure, mintClientSecret, testKey } from "./openai";

const KEY = "sk-proj-Test_Key-0123456789abcdef";
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

describe("mapFailure", () => {
  it.each([
    [401, null, "key-rejected"],
    [403, null, "key-rejected"],
    [402, null, "no-credit"],
    [429, { error: { code: "insufficient_quota", type: "insufficient_quota" } }, "no-credit"],
    [429, { error: { type: "insufficient_quota" } }, "no-credit"],
    [429, { error: { code: "rate_limit_exceeded" } }, "rate-limited"],
    [429, null, "rate-limited"],
    [500, null, "unavailable"],
    [503, null, "unavailable"],
    [400, { error: { message: "bad session" } }, "unavailable"],
  ])("%i %j -> %s", (status, body, code) => {
    expect(mapFailure(status, body)).toBe(code);
  });
});

describe("testKey", () => {
  it("calls GET /v1/models with the bearer key", async () => {
    const seen: { url: string; method: string | undefined; auth: string }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method, auth: (init.headers as Record<string, string>).Authorization! });
      return new Response('{"data":[]}', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await testKey(KEY, { baseUrl: "http://x", fetch: fetchFn })).toEqual({ ok: true, value: true });
    expect(seen).toEqual([{ url: "http://x/v1/models", method: "GET", auth: `Bearer ${KEY}` }]);
  });

  it("maps a rejected key, missing credit and rate limiting", async () => {
    const run = (status: number, body: unknown) => testKey(KEY, { baseUrl: "http://x", fetch: reply(status, body) });
    expect(await run(401, { error: { code: "invalid_api_key" } })).toEqual({ ok: false, code: "key-rejected" });
    expect(await run(429, { error: { code: "insufficient_quota" } })).toEqual({ ok: false, code: "no-credit" });
    expect(await run(429, { error: { code: "rate_limit_exceeded" } })).toEqual({ ok: false, code: "rate-limited" });
  });

  it("reports offline when the request cannot be made", async () => {
    const fetchFn = (async () => {
      throw new TypeError(`fetch failed for Bearer ${KEY}`);
    }) as unknown as typeof fetch;
    expect(await testKey(KEY, { baseUrl: "http://x", fetch: fetchFn })).toEqual({ ok: false, code: "offline" });
  });

  it("reports offline when OpenAI does not answer within the timeout", async () => {
    const hang = ((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    expect(await testKey(KEY, { baseUrl: "http://x", fetch: hang, timeoutMs: 20 })).toEqual({ ok: false, code: "offline" });
  });
});

describe("mintClientSecret", () => {
  it("posts the session for the model and voice and returns the secret and its expiry", async () => {
    let sent: { url: string; body: unknown; auth: string } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(init.body as string), auth: (init.headers as Record<string, string>).Authorization! };
      return new Response(JSON.stringify({ value: "ek_123", expires_at: 1_900_000_000, session: { id: "sess_1" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await mintClientSecret(KEY, { baseUrl: "http://x", fetch: fetchFn, model: "gpt-realtime-2.1", voice: "cedar" });
    expect(r).toEqual({ ok: true, value: { clientSecret: "ek_123", expiresAt: 1_900_000_000 } });
    expect(sent).toEqual({
      url: "http://x/v1/realtime/client_secrets",
      auth: `Bearer ${KEY}`,
      body: {
        expires_after: { anchor: "created_at", seconds: 600 },
        session: {
          type: "realtime",
          model: "gpt-realtime-2.1",
          max_output_tokens: 400,
          truncation: { type: "retention_ratio", retention_ratio: 0.8, token_limits: { post_instructions: 6000 } },
          audio: { output: { voice: "cedar" } },
        },
      },
    });
  });

  it("maps failures and refuses an answer without a secret", async () => {
    const run = (status: number, body: unknown) => mintClientSecret(KEY, { baseUrl: "http://x", fetch: reply(status, body), model: "gpt-realtime-2.1", voice: "marin" });
    expect(await run(401, {})).toEqual({ ok: false, code: "key-rejected" });
    expect(await run(429, { error: { code: "insufficient_quota" } })).toEqual({ ok: false, code: "no-credit" });
    expect(await run(200, { nothing: true })).toEqual({ ok: false, code: "unavailable" });
  });
});
