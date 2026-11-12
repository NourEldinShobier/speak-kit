import { afterEach, describe, expect, it } from "vite-plus/test";
import { PageContext, loopbackPage } from "../src/page-context";
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
    for (const bad of ["https://example.com/", "http://localhost.evil.com/", "file:///c:/x", "javascript:alert(1)", "nonsense"]) expect(loopbackPage(bad)).toBeUndefined();
  });

  it("drops query strings from messages and requests, and the label of a field that holds typed text", () => {
    const store = new PageContext(() => 1000);
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

  it("forgets events older than ten minutes and keeps at most 500", () => {
    let now = 0;
    const store = new PageContext(() => now);
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
