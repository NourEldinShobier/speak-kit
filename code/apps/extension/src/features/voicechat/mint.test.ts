import { describe, expect, it } from "vite-plus/test";
import { mintSession, voiceStatus } from "./mint";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const deps = (res: Response | Error, seen: { url?: string; auth?: string } = {}) => ({
  port: 47615,
  token: "tok-1",
  fetch: (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.auth = (init.headers as Record<string, string>).Authorization!;
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch,
});
const session = { clientSecret: "ek_abc", expiresAt: 1_900_000_000, model: "gpt-realtime-2.1", voice: "marin" };

describe("mintSession", () => {
  it("posts to the app with the pairing token and returns the session", async () => {
    const seen: { url?: string; auth?: string } = {};
    expect(await mintSession(deps(json(200, session), seen))).toEqual({ ok: true, session });
    expect(seen).toEqual({ url: "http://127.0.0.1:47615/v1/voice-chat/session", auth: "Bearer tok-1" });
  });

  it("maps the error codes of the app to the problems", async () => {
    expect(await mintSession(deps(json(409, { code: "no-key" })))).toEqual({ ok: false, problem: "no-key" });
    expect(await mintSession(deps(json(402, { code: "no-credit" })))).toEqual({ ok: false, problem: "no-credit" });
    expect(await mintSession(deps(json(502, { code: "offline" })))).toEqual({ ok: false, problem: "offline" });
  });

  it("reports an app that is down, a rejected token, an unpaired extension and a body it cannot read", async () => {
    expect(await mintSession(deps(new TypeError("fetch failed")))).toEqual({ ok: false, problem: "app-not-running" });
    expect(await mintSession(deps(json(401, {})))).toEqual({ ok: false, problem: "unpaired" });
    expect(await mintSession({ ...deps(json(200, session)), token: "" })).toEqual({ ok: false, problem: "unpaired" });
    expect(await mintSession(deps(json(200, { nope: 1 })))).toEqual({ ok: false, problem: "unavailable" });
    expect(await mintSession(deps(json(500, "<html>")))).toEqual({ ok: false, problem: "unavailable" });
  });
});

describe("voiceStatus", () => {
  it("reads whether the app has a key", async () => {
    expect(await voiceStatus(deps(json(200, { hasKey: false })))).toEqual({ ok: true, hasKey: false });
    expect(await voiceStatus(deps(new TypeError("x")))).toEqual({ ok: false, problem: "app-not-running" });
  });
});
