import { describe, expect, it } from "vite-plus/test";
import { createHealthClient } from "./health";

describe("health client", () => {
  const ok = {
    app: "speakkit",
    version: "1",
    apiVersion: 1,
    engine: { id: "kokoro", state: "ready" },
  };
  function client(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    let now = 1000;
    const urls: string[] = [];
    const c = createHealthClient({
      fetch: (async (u: string, init?: RequestInit) => {
        urls.push(u);
        return handler(u, init);
      }) as unknown as typeof fetch,
      now: () => now,
      port: async () => 47615,
      token: async () => "tok",
    });
    return {
      c,
      urls,
      tick: (ms: number) => {
        now += ms;
      },
    };
  }

  it("caches for 3 seconds and shares one request between concurrent callers", async () => {
    const { c, urls, tick } = client(() => Response.json(ok));
    const [a, b] = await Promise.all([c.health(), c.health()]);
    expect(a).toEqual({ ok: true, value: ok });
    expect(b).toEqual(a);
    expect(urls).toEqual(["http://127.0.0.1:47615/v1/health"]);
    tick(2999);
    await c.health();
    expect(urls).toHaveLength(1);
    tick(2);
    await c.health();
    expect(urls).toHaveLength(2);
    await c.health(true);
    expect(urls).toHaveLength(3);
  });

  it("maps failures to error codes", async () => {
    expect(
      await client(() => {
        throw new TypeError("Failed to fetch");
      }).c.health(),
    ).toMatchObject({ ok: false, code: "app-not-running" });
    expect(await client(() => Response.json({ app: "other" })).c.health()).toMatchObject({
      ok: false,
      code: "app-not-running",
    });
    expect(await client(() => Response.json({ ...ok, apiVersion: 2 })).c.health()).toMatchObject({
      ok: false,
      code: "version-mismatch",
    });
  });

  it("auth-check sends the bearer token and maps 204 / 401", async () => {
    let seen = "";
    const good = client((_u, init) => {
      seen = (init!.headers as Record<string, string>).Authorization!;
      return new Response(null, { status: 204 });
    });
    expect(await good.c.authCheck()).toEqual({ ok: true, value: true });
    expect(seen).toBe("Bearer tok");
    expect(await good.c.authCheck(47616, "other")).toEqual({ ok: true, value: true });
    expect(good.urls.at(-1)).toBe("http://127.0.0.1:47616/v1/auth/check");
    expect(seen).toBe("Bearer other");
    expect(await client(() => new Response(null, { status: 401 })).c.authCheck()).toMatchObject({
      ok: false,
      code: "token-rejected",
    });
    const wrong = new Response(JSON.stringify({ error: { code: "token-rejected", message: "x" } }), { status: 404 });
    expect(await client(() => wrong).c.authCheck()).toMatchObject({ ok: false, code: "token-rejected" });
    expect(await client(() => new Response("<html>", { status: 404 })).c.authCheck()).toMatchObject({ ok: false, code: "app-not-running" });
  });
});
