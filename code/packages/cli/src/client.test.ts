import { describe, expect, it } from "vite-plus/test";
import { AppClient } from "./client";

const conn = { base: "http://127.0.0.1:47615", token: "tok" };
const reply = (status: number, body: unknown) => async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const STATUS = { status: "idle", title: "", index: 0, total: 0, elapsedMs: 0, totalMs: 0, queued: 0 };

describe("AppClient requests", () => {
  it("sends the bearer token and a JSON body to the right address", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const c = new AppClient(
      conn,
      async (url, init) => ((seen = { url: String(url), init: init ?? {} }), new Response(JSON.stringify({ id: "r", position: 0, sentences: 1, estimatedMs: 5 }), { status: 202 })),
    );
    await c.speak({ text: "hi", mode: "queue" });
    expect(seen!.url).toBe("http://127.0.0.1:47615/v1/automation/speak");
    expect(seen!.init.method).toBe("POST");
    expect(seen!.init.body).toBe('{"text":"hi","mode":"queue"}');
    expect(seen!.init.headers).toMatchObject({ Authorization: "Bearer tok", "Content-Type": "application/json" });
  });
  it("marks every call as the app's own so it never shows as a paired browser", async () => {
    let headers: unknown;
    const c = new AppClient(conn, async (_u, init) => ((headers = init?.headers), new Response(JSON.stringify(STATUS))));
    await c.status();
    expect(headers).toMatchObject({ "x-speakkit-app": "1" });
  });
  it("sends clear true or false with stop", async () => {
    const bodies: string[] = [];
    const c = new AppClient(conn, async (_u, init) => (bodies.push(String(init?.body)), new Response(JSON.stringify(STATUS))));
    await c.stop(true);
    await c.stop(false);
    expect(bodies).toEqual(['{"clear":true}', '{"clear":false}']);
  });
  it("escapes an export id in the path", async () => {
    let url = "";
    const c = new AppClient(conn, async (u) => ((url = String(u)), new Response(JSON.stringify({ id: "a/b", stage: "done", progress: 1 }))));
    await c.exportStatus("a/b?x");
    expect(url).toBe("http://127.0.0.1:47615/v1/automation/export/a%2Fb%3Fx");
  });
});

describe("AppClient failures", () => {
  const code = async (f: () => Promise<Response>, run: (c: AppClient) => Promise<unknown> = (c) => c.status()) => {
    try {
      await run(new AppClient(conn, f));
    } catch (e) {
      return (e as { code: string }).code;
    }
    return null;
  };
  it("a refused connection means the app is not running", async () => {
    expect(
      await code(async () => {
        throw new TypeError("fetch failed");
      }),
    ).toBe("not_running");
  });
  it("a typed error body gives its code and message", async () => {
    const c = new AppClient(conn, reply(413, { code: "too_large", error: { code: "too_large", message: "big" } }));
    await expect(c.speak({ text: "x" })).rejects.toMatchObject({ code: "too_large", message: "big", exitCode: 1 });
  });
  it("401 is token_rejected and exits 3", async () => {
    const c = new AppClient(conn, reply(401, { error: { code: "token-rejected", message: "missing or wrong token" } }));
    await expect(c.status()).rejects.toMatchObject({ code: "token_rejected", exitCode: 3 });
  });
  it("a plain 429 is queue_full", async () => {
    expect(await code(reply(429, { error: { code: "busy", message: "busy" } }))).toBe("queue_full");
  });
  it("400 is invalid_input and anything else failed, with the server's words when it gave some", async () => {
    expect(await code(reply(400, { error: { code: "invalid-request", message: "body is not valid JSON" } }))).toBe("invalid_input");
    const c = new AppClient(conn, reply(500, { error: { code: "internal", message: "internal error" } }));
    await expect(c.status()).rejects.toMatchObject({ code: "failed", message: "internal error" });
    await expect(new AppClient(conn, reply(502, "<html>")).status()).rejects.toMatchObject({ code: "failed", message: "Speak Kit answered HTTP 502." });
  });
  it("an answer in an unknown shape is reported, not passed on", async () => {
    await expect(new AppClient(conn, reply(200, { status: "dancing" })).status()).rejects.toMatchObject({ code: "failed", message: expect.stringContaining("Update both") });
    await expect(new AppClient(conn, reply(200, "not json")).status()).rejects.toMatchObject({ code: "failed" });
    await expect(new AppClient(conn, reply(200, { voices: 3 })).voices()).rejects.toMatchObject({ code: "failed" });
  });
  it("a call that takes too long times out", async () => {
    const hang = (_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    const c = new AppClient(conn, hang as typeof fetch, 20);
    await expect(c.status()).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("AppClient events", () => {
  const stream =
    (...parts: string[]) =>
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            for (const p of parts) c.enqueue(new TextEncoder().encode(p));
            c.close();
          },
        }),
        { status: 200 },
      );
  it("yields each status and skips events it does not know or cannot read", async () => {
    const c = new AppClient(
      conn,
      stream(
        `event: status\ndata: ${JSON.stringify(STATUS)}\n\n`,
        "event: other\ndata: {}\n\n",
        "event: status\ndata: {nope\n\n",
        `event: status\ndata: ${JSON.stringify({ ...STATUS, status: "playing" })}\n\n`,
      ),
    );
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const s of c.events()) seen.push(s.status);
      })(),
    ).rejects.toMatchObject({ code: "not_running", message: "Speak Kit closed the event stream." });
    expect(seen).toEqual(["idle", "playing"]);
  });
  it("ends quietly when the caller aborts", async () => {
    const ac = new AbortController();
    const c = new AppClient(conn, stream(`event: status\ndata: ${JSON.stringify(STATUS)}\n\n`));
    const seen = [];
    for await (const s of c.events(ac.signal)) {
      seen.push(s);
      ac.abort();
    }
    expect(seen).toHaveLength(1);
  });
  it("does not time out a long-lived stream", async () => {
    let signalSeen: AbortSignal | null | undefined;
    const c = new AppClient(conn, async (_u, init) => ((signalSeen = init?.signal), new Response(new ReadableStream<Uint8Array>({ start: (x) => x.close() }))), 5);
    await c
      .events()
      .next()
      .catch(() => {});
    expect(signalSeen).toBeUndefined();
  });
});
