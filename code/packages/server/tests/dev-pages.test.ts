import { afterEach, describe, expect, it } from "vite-plus/test";
import { DevPages, loopbackPage } from "../src/dev-pages";
import { start, type Ctx } from "./harness";

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});
const post = (c: Ctx, body: unknown) => fetch(`${c.base}/v1/capture/page-context`, { method: "POST", headers: { ...c.auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const page = { url: "http://localhost:3000/orders/12?token=secret#x", title: "Orders" };

describe("page context store", () => {
  it("accepts pages on this computer only and keeps their origin and path", () => {
    expect(loopbackPage("http://localhost:3000/a/b?x=1#y")).toBe("http://localhost:3000/a/b");
    expect(loopbackPage("https://app.localhost/")).toBe("https://app.localhost/");
    expect(loopbackPage("http://127.0.0.1:5173/")).toBe("http://127.0.0.1:5173/");
    expect(loopbackPage("http://[::1]:5173/x")).toBe("http://[::1]:5173/x");
    expect(loopbackPage(`http://localhost/${"p".repeat(300)}`)?.length).toBe(160);
    for (const bad of ["https://example.com/", "http://localhost.evil.com/", "file:///c:/x", "javascript:alert(1)", "nonsense"]) expect(loopbackPage(bad)).toBeUndefined();
  });

  it("drops query strings from messages and requests, and the label of a field that holds typed text", () => {
    const store = new DevPages(() => 1000);
    store.add({
      page,
      events: [
        { type: "click", at: 900, element: { tag: "input", label: "hunter2", component: "LoginForm" } },
        { type: "click", at: 910, element: { tag: "button", label: "Save", role: "button" } },
        { type: "console-error", at: 920, message: "Failed https://api.test/orders?token=abc123 now" },
        { type: "failed-request", at: 930, method: "GET", url: "/api/orders?token=abc123", status: 500 },
      ],
    });
    expect(store.between(0, 2000)).toEqual([
      { type: "click", at: 900, page: "http://localhost:3000/orders/12", element: { tag: "input", component: "LoginForm" } },
      { type: "click", at: 910, page: "http://localhost:3000/orders/12", element: { tag: "button", label: "Save", role: "button" } },
      { type: "console-error", at: 920, page: "http://localhost:3000/orders/12", message: "Failed /orders now" },
      { type: "failed-request", at: 930, page: "http://localhost:3000/orders/12", method: "GET", path: "/api/orders", status: 500 },
    ]);
    expect(store.between(905, 915).length).toBe(1);
  });

  it("keeps every named field of a click, drops the label of every typed-text element, and cuts an address to its path", () => {
    const store = new DevPages(() => 1000);
    const el = (tag: string) => ({ type: "click" as const, at: 1000, element: { tag, role: "r", label: "L", component: "C", path: "main > x" } });
    const long = "z".repeat(300);
    store.add({
      page,
      events: [
        el("div"),
        el("textarea"),
        el("select"),
        { type: "failed-request", at: 1000, method: "PUT", url: "http://[bad", status: 404 },
        { type: "console-error", at: 1000, message: `see http://localhost:1/a/b?x=1, and HTTP://h.test/c#d ${long}` },
      ],
    });
    const got = store.between(1000, 1000);
    expect(got[0]).toEqual({ type: "click", at: 1000, page: "http://localhost:3000/orders/12", element: { tag: "div", role: "r", label: "L", component: "C", path: "main > x" } });
    expect(got[1]).toMatchObject({ element: { tag: "textarea", role: "r", component: "C", path: "main > x" } });
    expect((got[1] as { element: { label?: string } }).element.label).toBeUndefined();
    expect((got[2] as { element: { label?: string } }).element.label).toBeUndefined();
    expect(got[3]).toMatchObject({ type: "failed-request", path: "/" });
    expect((got[4] as { message: string }).message.startsWith("see /a/b and /c zzz")).toBe(true);
    expect((got[4] as { message: string }).message.length).toBe(200);
  });

  it("a time window includes both ends, and an event exactly ten minutes old is kept", () => {
    let now = 600_000;
    const store = new DevPages(() => now);
    const click = (at: number) => ({ type: "click" as const, at, element: { tag: "a" } });
    store.add({ page, events: [click(0), click(10), click(20)] });
    expect(store.between(10, 20).map((e) => e.at)).toEqual([10, 20]);
    expect(store.between(0, 600_000).map((e) => e.at)).toEqual([0, 10, 20]);
    now = 600_001;
    store.add({ page, events: [] });
    expect(store.between(0, 600_001).map((e) => e.at)).toEqual([10, 20]);
  });

  it("refuses a page that is not on this computer, and stores nothing from it", () => {
    const store = new DevPages(() => 1000);
    const click = { type: "click" as const, at: 1000, element: { tag: "a" } };
    expect(store.add({ page: { url: "https://example.com/" }, events: [click] })).toBe(false);
    expect(store.add({ page: { url: "ftp://localhost/" }, events: [click] })).toBe(false);
    expect(store.between(0, 2000)).toEqual([]);
    expect(store.add({ page, events: [] })).toBe(true);
  });

  it("forgets events older than ten minutes and keeps at most 500", () => {
    let now = 0;
    const store = new DevPages(() => now);
    const click = (at: number) => ({ type: "click" as const, at, element: { tag: "a" } });
    store.add({ page, events: [click(0)] });
    now = 10 * 60_000 + 1;
    store.add({ page, events: [click(now)] });
    expect(store.between(0, now).map((e) => e.at)).toEqual([now]);
    for (let i = 0; i < 12; i++) store.add({ page, events: Array.from({ length: 50 }, (_, k) => click(now + i * 50 + k)) });
    expect(store.between(0, Number.MAX_SAFE_INTEGER).length).toBe(500);
  });
});

describe("page context routes", () => {
  it("takes a post and returns the events of a time window", async () => {
    const c = (ctx = await start());
    const at = Date.now();
    const res = await post(c, { page, events: [{ type: "click", at, element: { tag: "button", label: "Pay" } }] });
    expect([res.status, await res.json()]).toEqual([202, { accepted: 1 }]);
    const got = await (await fetch(`${c.base}/v1/capture/page-context?from=${at - 1}&to=${at + 1}`, { headers: c.auth })).json();
    expect(got).toEqual({ events: [{ type: "click", at, page: "http://localhost:3000/orders/12", element: { tag: "button", label: "Pay" } }] });
    expect((await (await fetch(`${c.base}/v1/capture/page-context?from=${at + 5}`, { headers: c.auth })).json()).events).toEqual([]);
  });

  it("refuses a field that is not a name, a page that is not on this computer, bad numbers and a missing token", async () => {
    const c = (ctx = await start());
    const click = { type: "click", at: 1, element: { tag: "button" } };
    expect((await post(c, { page, events: [{ ...click, body: "{}" }] })).status).toBe(400);
    expect((await post(c, { page, events: [{ type: "failed-request", at: 1, method: "POST", url: "/x", status: 500, headers: { a: "b" } }] })).status).toBe(400);
    expect((await post(c, { page, cookies: "a=b", events: [] })).status).toBe(400);
    expect((await post(c, { page: { url: "https://example.com/" }, events: [click] })).status).toBe(400);
    expect((await post(c, { page, events: Array.from({ length: 51 }, () => click) })).status).toBe(400);
    expect((await fetch(`${c.base}/v1/capture/page-context?from=x`, { headers: c.auth })).status).toBe(400);
    expect((await fetch(`${c.base}/v1/capture/page-context`)).status).toBe(401);
  });
});

describe("page context from the browser", () => {
  const fromPage = (c: Ctx, origin: string, path = "/v1/capture/page-context") =>
    fetch(`${c.base}${path}`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });

  it("answers the preflight of a page on this computer, for this route only", async () => {
    const c = (ctx = await start());
    const ok = await fromPage(c, "http://localhost:3000");
    expect([ok.status, ok.headers.get("access-control-allow-origin"), ok.headers.get("access-control-allow-headers")]).toEqual([
      204,
      "http://localhost:3000",
      "Authorization, Content-Type, X-SpeakKit-Replace",
    ]);
    expect((await fromPage(c, "https://example.com")).status).toBe(403);
    expect((await fromPage(c, "http://localhost.evil.com")).status).toBe(403);
    expect((await fromPage(c, "http://localhost:3000", "/v1/speak")).status).toBe(403);
  });

  it("lets a page on this computer post with the token, and still refuses it without", async () => {
    const c = (ctx = await start());
    const body = JSON.stringify({ page, events: [{ type: "click", at: 5, element: { tag: "button" } }] });
    const headers = { Origin: "http://localhost:3000", "Content-Type": "application/json" };
    const withToken = await fetch(`${c.base}/v1/capture/page-context`, { method: "POST", headers: { ...headers, ...c.auth }, body });
    expect([withToken.status, withToken.headers.get("access-control-allow-origin")]).toEqual([202, "http://localhost:3000"]);
    expect((await fetch(`${c.base}/v1/capture/page-context`, { method: "POST", headers, body })).status).toBe(401);
  });

  it("serves the script without a token, and it posts what the page does", async () => {
    const c = (ctx = await start());
    const res = await fetch(`${c.base}/v1/capture/page-context/sdk.js`);
    expect([res.status, res.headers.get("content-type")]).toEqual([200, "text/javascript; charset=utf-8"]);

    const posts: { url: string; body: { events: { type: string; element?: unknown; message?: string }[] } }[] = [];
    const listeners: Record<string, (e: unknown) => void> = {};
    const consoleErrors: unknown[][] = [];
    let timer: (() => void) | undefined;
    const button = { nodeType: 1, tagName: "BUTTON", id: "save", textContent: "  Save   order ", getAttribute: (n: string) => (n === "role" ? null : null), parentElement: null };
    const win = {
      location: { href: "http://localhost:3000/orders?token=x" },
      fetch: async (url: string, init?: { body?: string; method?: string }) => {
        if (init?.body) posts.push({ url, body: JSON.parse(init.body) });
        return { status: url.endsWith("/api/orders") ? 500 : 200 };
      },
      setTimeout: (fn: () => void) => ((timer = fn), 1),
      console: { error: (...a: unknown[]) => consoleErrors.push(a) },
      addEventListener: (n: string, fn: (e: unknown) => void) => (listeners[n] = fn),
    };
    const doc = {
      currentScript: { src: `${c.base}/v1/capture/page-context/sdk.js`, getAttribute: (n: string) => (n === "data-token" ? "tok" : null) },
      title: "Orders",
      addEventListener: (n: string, fn: (e: unknown) => void) => (listeners[`doc-${n}`] = fn),
    };
    new Function("window", "document", await res.text())(win, doc);

    listeners["doc-click"]!({ target: { closest: () => button } });
    win.console.error("bad", 7);
    await win.fetch("http://localhost:3000/api/orders", { method: "post" });
    await win.fetch(`${c.base}/v1/capture/page-context`, { method: "POST", body: "{}" });
    timer?.();
    await new Promise((r) => setTimeout(r, 0));

    const sent = posts.filter((p) => p.url.endsWith("page-context") && p.body.events);
    expect(sent.length).toBe(1);
    expect(sent[0]!.body.events.map((e) => e.type)).toEqual(["click", "console-error", "failed-request"]);
    expect(sent[0]!.body.events[0]).toMatchObject({ element: { tag: "button", label: "Save order", path: "button#save" } });
    expect(sent[0]!.body.events[1]!.message).toBe("bad 7");
    expect(consoleErrors).toEqual([["bad", 7]]);
  });
});
