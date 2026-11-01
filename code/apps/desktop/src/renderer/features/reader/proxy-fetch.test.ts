import { describe, expect, it } from "vite-plus/test";
import type { ProxyChunk, ProxyRequest } from "../../../main/library/contract";
import { createProxyFetch } from "./proxy-fetch";

function fakeBridge() {
  const opened: ProxyRequest[] = [];
  const cancelled: number[] = [];
  let cb: (c: ProxyChunk) => void = () => {};
  return {
    opened,
    cancelled,
    push: (c: ProxyChunk) => cb(c),
    bridge: {
      proxyOpen: async (r: ProxyRequest) => void opened.push(r),
      proxyCancel: (id: number) => void cancelled.push(id),
      onProxyChunk: (f: (c: ProxyChunk) => void) => ((cb = f), () => {}),
    },
  };
}
const bytes = (s: string) => new TextEncoder().encode(s);

describe("proxy fetch", () => {
  it("sends path, method, body and the replace group, and streams the answer", async () => {
    const f = fakeBridge();
    const doFetch = createProxyFetch(f.bridge);
    const p = doFetch("http://127.0.0.1:47615/v1/speak", { method: "POST", body: '{"x":1}', headers: { Authorization: "Bearer t", "X-SpeakKit-Replace": "tab-0" } });
    expect(f.opened).toEqual([{ id: 1, path: "/v1/speak", method: "POST", body: '{"x":1}', replace: "tab-0" }]);
    f.push({ id: 1, type: "head", status: 200 });
    const res = await p;
    expect(res.status).toBe(200);
    f.push({ id: 1, type: "data", data: bytes("ab") });
    f.push({ id: 1, type: "data", data: bytes("cd") });
    f.push({ id: 1, type: "end" });
    expect(await res.text()).toBe("abcd");
  });

  it("answers a bodiless status without a stream", async () => {
    const f = fakeBridge();
    const p = createProxyFetch(f.bridge)("http://127.0.0.1:1/v1/engine/hold", { method: "POST", body: '{"ms":0}' });
    f.push({ id: 1, type: "head", status: 204 });
    expect((await p).status).toBe(204);
  });

  it("rejects with a TypeError when the server cannot be reached", async () => {
    const f = fakeBridge();
    const p = createProxyFetch(f.bridge)("http://127.0.0.1:1/v1/health");
    f.push({ id: 1, type: "error", message: "connect ECONNREFUSED" });
    await expect(p).rejects.toBeInstanceOf(TypeError);
  });

  it("aborting cancels in main and errors the stream", async () => {
    const f = fakeBridge();
    const ac = new AbortController();
    const p = createProxyFetch(f.bridge)("http://127.0.0.1:1/v1/speak", { method: "POST", body: "{}", signal: ac.signal });
    f.push({ id: 1, type: "head", status: 200 });
    const res = await p;
    const reader = res.body!.getReader();
    ac.abort();
    expect(f.cancelled).toEqual([1]);
    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancelling the body reader cancels in main", async () => {
    const f = fakeBridge();
    const p = createProxyFetch(f.bridge)("http://127.0.0.1:1/v1/speak", { method: "POST", body: "{}" });
    f.push({ id: 1, type: "head", status: 200 });
    await (await p).body!.cancel();
    expect(f.cancelled).toEqual([1]);
  });
});
