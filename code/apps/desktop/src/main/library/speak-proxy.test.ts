import { describe, expect, it } from "vite-plus/test";
import type { ProxyChunk } from "../../shared/library/contract";
import { createSpeakProxy, MAX_OPEN_REQUESTS } from "./speak-proxy";

const hanging = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
const abortable = ((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;

describe("speak proxy limits", () => {
  it("refuses a request beyond the cap instead of opening another upstream stream", async () => {
    const proxy = createSpeakProxy({ target: () => ({ port: 1, token: "t" }), fetch: hanging });
    for (let id = 1; id <= MAX_OPEN_REQUESTS; id++) void proxy.open({ id, path: "/v1/speak", method: "POST", body: "{}" }, () => {});
    const chunks: ProxyChunk[] = [];
    await proxy.open({ id: 99, path: "/v1/speak", method: "POST", body: "{}" }, (c) => chunks.push(c));
    expect(chunks).toEqual([{ id: 99, type: "error", error: { code: "too-many-requests" } }]);
  });

  it("cancelAll aborts every running request and frees the slots", async () => {
    const proxy = createSpeakProxy({ target: () => ({ port: 1, token: "t" }), fetch: abortable });
    const done = [1, 2, 3].map((id) => proxy.open({ id, path: "/v1/speak", method: "POST", body: "{}" }, () => {}));
    proxy.cancelAll();
    await Promise.all(done);
    const chunks: ProxyChunk[] = [];
    const again = proxy.open({ id: 4, path: "/v1/health", method: "GET" }, (c) => chunks.push(c));
    proxy.cancel(4);
    await again;
    expect(chunks).toEqual([]);
  });
});
