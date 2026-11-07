import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CONTROL_MS, SPEAK_MS, withDeadline } from "./deadline";

/** A fetch that never answers until its signal aborts. */
const hanging: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));

afterEach(() => vi.useRealTimers());

describe("withDeadline", () => {
  it("aborts a control request that gets no answer within 8 s", async () => {
    vi.useFakeTimers();
    const result = withDeadline(hanging)("http://127.0.0.1:47615/v1/engine/hold", { method: "POST" });
    const caught = result.catch((e: DOMException) => e.name);
    await vi.advanceTimersByTimeAsync(CONTROL_MS);
    expect(await caught).toBe("TimeoutError");
  });

  it("gives /v1/speak 30 s to start answering", async () => {
    vi.useFakeTimers();
    const caught = withDeadline(hanging)("http://127.0.0.1:47615/v1/speak", { method: "POST" }).catch((e: DOMException) => e.name);
    await vi.advanceTimersByTimeAsync(CONTROL_MS);
    let settled = false;
    void caught.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(SPEAK_MS - CONTROL_MS);
    expect(await caught).toBe("TimeoutError");
  });

  it("leaves no timer behind once the response headers arrive, and keeps the caller's signal live", async () => {
    vi.useFakeTimers();
    const own = new AbortController();
    let seen: AbortSignal | null | undefined;
    const ok: typeof fetch = async (_input, init) => {
      seen = init?.signal;
      return new Response("ok");
    };
    const res = await withDeadline(ok)("http://127.0.0.1:47615/v1/speak", { signal: own.signal });
    expect(res.ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    own.abort();
    expect(seen?.aborted).toBe(true);
  });
});
