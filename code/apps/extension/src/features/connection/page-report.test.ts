import { describe, expect, it } from "vite-plus/test";
import { createPageReporter, hostOf, postPage } from "./page-report";

describe("hostOf", () => {
  it("gives the host of a website and nothing for other addresses", () => {
    expect(hostOf("https://Mail.Google.com/inbox?x=1")).toBe("mail.google.com");
    expect(hostOf("http://localhost:3000/a")).toBe("localhost");
    expect(hostOf("chrome://settings")).toBe("");
    expect(hostOf("file:///C:/a.html")).toBe("");
    expect(hostOf("http://[::1]/")).toBe("");
    expect(hostOf("not a url")).toBe("");
    expect(hostOf(undefined)).toBe("");
    expect(hostOf("")).toBe("");
  });
});

describe("page reporter", () => {
  const make = (accept = true) => {
    const sent: string[] = [];
    const clock = { t: 0 };
    const r = createPageReporter({ send: async (h) => (sent.push(h), accept), now: () => clock.t, renewMs: 100 });
    return { r, sent, clock };
  };
  it("sends a new host at once and the same host again only after the renew time", async () => {
    const { r, sent, clock } = make();
    await r.report("a.com");
    clock.t = 99;
    await r.report("a.com");
    expect(sent).toEqual(["a.com"]);
    clock.t = 100;
    await r.report("a.com");
    await r.report("b.com");
    await r.report("");
    expect(sent).toEqual(["a.com", "a.com", "b.com", ""]);
  });
  it("tries again at the next call when the app did not take the report", async () => {
    const { r, sent } = make(false);
    await r.report("a.com");
    await r.report("a.com");
    expect(sent).toEqual(["a.com", "a.com"]);
  });
});

describe("postPage", () => {
  const deps = (res: Response | Error, token = "t") => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    return {
      calls,
      d: {
        fetch: (async (url: string, init?: RequestInit) => {
          calls.push({ url, init });
          if (res instanceof Error) throw res;
          return res;
        }) as unknown as typeof fetch,
        port: async () => 47615,
        token: async () => token,
      },
    };
  };
  it("posts the host with the token to the app on this computer", async () => {
    const { d, calls } = deps(new Response(null, { status: 204 }));
    expect(await postPage(d, "a.com")).toBe(true);
    expect(calls[0]?.url).toBe("http://127.0.0.1:47615/v1/page-context");
    expect(calls[0]?.init?.body).toBe('{"host":"a.com"}');
    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
  });
  it("is false without a token (nothing is sent), when the app refuses and when it is not running", async () => {
    const none = deps(new Response(null, { status: 204 }), "");
    expect(await postPage(none.d, "a.com")).toBe(false);
    expect(none.calls).toEqual([]);
    expect(await postPage(deps(new Response("no", { status: 401 })).d, "a.com")).toBe(false);
    expect(await postPage(deps(new TypeError("fetch failed")).d, "a.com")).toBe(false);
  });
});
