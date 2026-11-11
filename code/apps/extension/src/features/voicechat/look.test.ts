import { describe, expect, it } from "vite-plus/test";
import type { VoiceView } from "@speakkit/protocol";
import { Looker, lookAtScreen } from "./look";
import type { VoiceEvent } from "./machine";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const deps = (res: Response | Error, seen: { url?: string; auth?: string; body?: unknown } = {}) => ({
  port: 47615,
  token: "tok-1",
  fetch: (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.auth = (init.headers as Record<string, string>).Authorization!;
    seen.body = JSON.parse(String(init.body));
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch,
});
const look = { image: "/9j/", width: 1280, height: 720, text: "Total 42", ocr: "ok", target: "Notes", scope: "window" };
const req = { session: "conv-1", scope: "window" } as const;

describe("lookAtScreen", () => {
  it("posts the session and scope to the app with the pairing token and returns the look", async () => {
    const seen: { url?: string; auth?: string; body?: unknown } = {};
    expect(await lookAtScreen(deps(json(200, look), seen), req)).toEqual({ ok: true, look });
    expect(seen).toEqual({ url: "http://127.0.0.1:47615/v1/voice-chat/look", auth: "Bearer tok-1", body: req });
  });

  it("passes the codes of the app on, whatever the HTTP status", async () => {
    for (const [status, code] of [
      [403, "declined"],
      [404, "no-window"],
      [409, "busy"],
      [429, "rate-limited"],
      [501, "unsupported"],
      [502, "capture-failed"],
      [503, "unavailable"],
    ] as const)
      expect(await lookAtScreen(deps(json(status, { code, error: { code, message: "m" } })), req)).toEqual({ ok: false, code });
  });

  it("reports an app that is down, an unpaired extension and a rejected token", async () => {
    expect(await lookAtScreen(deps(new TypeError("fetch failed")), req)).toEqual({ ok: false, code: "app-not-running" });
    expect(await lookAtScreen({ ...deps(json(200, look)), token: "" }, req)).toEqual({ ok: false, code: "unpaired" });
    expect(await lookAtScreen(deps(json(401, { error: { code: "token-rejected", message: "no" } })), req)).toEqual({ ok: false, code: "unpaired" });
  });

  it("is unavailable for an answer it cannot read", async () => {
    expect(await lookAtScreen(deps(json(200, { nope: 1 })), req)).toEqual({ ok: false, code: "unavailable" });
    expect(await lookAtScreen(deps(json(500, "<html>")), req)).toEqual({ ok: false, code: "unavailable" });
  });
});

describe("Looker", () => {
  function setup(phaseAfter: VoiceView["phase"], res: Response | Error = json(200, look)) {
    const log: string[] = [];
    const seen: { url?: string; auth?: string; body?: unknown } = {};
    const d = deps(res, seen);
    const looker = new Looker({
      app: () => ({ port: d.port, token: d.token }),
      fetch: d.fetch,
      dispatch: (e: VoiceEvent) => log.push(e.t),
      touch: () => log.push("touch"),
      phase: () => (log.push("phase"), phaseAfter),
    });
    return { looker, log, seen };
  }

  it("shows the look from start to end, keeps the conversation awake around it and resumes the model when it is thinking", async () => {
    const { looker, log, seen } = setup("thinking");
    expect(await looker.look({ scope: "screen" })).toEqual({ answer: { ok: true, look }, resume: true });
    expect(log).toEqual(["look-start", "touch", "look-end", "touch", "phase"]);
    expect(seen.body).toEqual({ session: expect.stringMatching(/^[0-9a-f-]{36}$/), scope: "screen" });
  });

  it("does not resume the model when the user spoke meanwhile", async () => {
    expect((await setup("listening").looker.look({ scope: "window" })).resume).toBe(false);
  });

  it("ends the look also when the app did not answer", async () => {
    const { looker, log } = setup("thinking", new TypeError("fetch failed"));
    expect((await looker.look({ scope: "window" })).answer).toEqual({ ok: false, code: "app-not-running" });
    expect(log).toContain("look-end");
  });

  it("names the conversation with one id for every look and a new id for a new conversation", async () => {
    const a = setup("thinking");
    await a.looker.look({ scope: "window" });
    const first = (a.seen.body as { session: string }).session;
    await a.looker.look({ scope: "screen" });
    expect((a.seen.body as { session: string }).session).toBe(first);
    const b = setup("thinking");
    await b.looker.look({ scope: "window" });
    expect((b.seen.body as { session: string }).session).not.toBe(first);
  });
});
