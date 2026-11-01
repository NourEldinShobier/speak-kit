import { describe, expect, it } from "vite-plus/test";
import { fetchPage } from "./fetch-url";

const html = (body: string, headers: Record<string, string> = {}) => new Response(body, { headers: { "content-type": "text/html", ...headers } });
const ARTICLE = `<html><head><title>Hello</title></head><body><article><p>${"Readable words go here. ".repeat(40)}</p></article></body></html>`;

describe("fetchPage: redirects", () => {
  it("follows a redirect between public hosts", async () => {
    const doFetch = (async (u: URL) => (u.host === "a.example" ? new Response(null, { status: 301, headers: { location: "https://b.example/post" } }) : html(ARTICLE))) as unknown as typeof fetch;
    expect(await fetchPage("https://a.example/", doFetch)).toMatchObject({ host: "b.example" });
  });

  it("stops after five redirects", async () => {
    const doFetch = (async () => new Response(null, { status: 302, headers: { location: "https://loop.example/" } })) as unknown as typeof fetch;
    await expect(fetchPage("https://loop.example/", doFetch)).rejects.toMatchObject({ message: expect.stringContaining("redirected too many times") });
  });
});

describe("fetchPage: size", () => {
  it("rejects on the declared length without reading the body", async () => {
    let read = false;
    const body = new ReadableStream({ pull: (c) => ((read = true), c.enqueue(new Uint8Array(10)), undefined) }, { highWaterMark: 0 });
    const doFetch = (async () => new Response(body, { headers: { "content-type": "text/html", "content-length": String(9 * 1024 * 1024) } })) as unknown as typeof fetch;
    await expect(fetchPage("https://big.example/", doFetch)).rejects.toMatchObject({ reason: "too-large" });
    expect(read).toBe(false);
  });

  it("cuts off an endless body at 8 MB instead of buffering it", async () => {
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream({ pull: (c) => ((sent += chunk.length), c.enqueue(chunk)) }, { highWaterMark: 0 });
    const doFetch = (async () => new Response(body, { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    await expect(fetchPage("https://endless.example/", doFetch)).rejects.toMatchObject({ reason: "too-large" });
    expect(sent).toBeLessThanOrEqual(10 * 1024 * 1024);
  });
});
