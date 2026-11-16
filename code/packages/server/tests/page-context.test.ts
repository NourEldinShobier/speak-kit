import { afterEach, describe, expect, it } from "vite-plus/test";
import { start, type Ctx } from "./harness";

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});

const post = (c: Ctx, body: unknown, auth = true) =>
  fetch(`${c.base}/v1/page-context`, { method: "POST", headers: { ...(auth ? c.auth : {}), "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /v1/page-context", () => {
  it("hands the host to the app and answers 204", async () => {
    const seen: string[] = [];
    ctx = await start({}, undefined, { pageContext: { report: (h) => void seen.push(h) } });
    expect((await post(ctx, { host: "mail.google.com" })).status).toBe(204);
    expect((await post(ctx, { host: "" })).status).toBe(204);
    expect(seen).toEqual(["mail.google.com", ""]);
  });

  it("needs the token", async () => {
    const seen: string[] = [];
    ctx = await start({}, undefined, { pageContext: { report: (h) => void seen.push(h) } });
    expect((await post(ctx, { host: "a.com" }, false)).status).toBe(404);
    expect(seen).toEqual([]);
  });

  it("refuses a body that is not a host name, a path or text that is too long, and does not report it", async () => {
    const seen: string[] = [];
    ctx = await start({}, undefined, { pageContext: { report: (h) => void seen.push(h) } });
    for (const body of [{ host: "https://a.com/x" }, { host: "A.com" }, { host: 5 }, { host: "a".repeat(254) }, {}, [], "not json"])
      expect((await post(ctx, body)).status, JSON.stringify(body)).toBe(400);
    expect(seen).toEqual([]);
  });

  it("accepts the report when the app keeps no page address", async () => {
    ctx = await start();
    expect((await post(ctx, { host: "a.com" })).status).toBe(204);
  });
});
