import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { MicLease } from "./lease";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const bodies: string[] = [];
  const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(String(init?.body));
    return new Response(null, { status: 204 });
  });
  const lease = new MicLease(() => ({ fetch: fetchFn as unknown as typeof fetch, port: 48100, token: "t" }));
  return { lease, bodies, fetchFn };
}

describe("microphone lease", () => {
  it("reports held at once and every 10 seconds, and not held when stopped", () => {
    const { lease, bodies, fetchFn } = setup();
    lease.start();
    expect(bodies).toEqual(['{"held":true}']);
    vi.advanceTimersByTime(20_000);
    expect(bodies).toEqual(Array(3).fill('{"held":true}'));
    lease.stop();
    expect(bodies.at(-1)).toBe('{"held":false}');
    vi.advanceTimersByTime(30_000);
    expect(bodies).toHaveLength(4);
    expect(fetchFn.mock.calls[0]![0]).toBe("http://127.0.0.1:48100/v1/voice-chat/mic");
  });

  it("starting twice does not double the reports, and stopping without a start says nothing", () => {
    const { lease, bodies } = setup();
    lease.stop();
    expect(bodies).toEqual([]);
    lease.start();
    lease.start();
    vi.advanceTimersByTime(10_000);
    expect(bodies).toHaveLength(2);
  });

  it("survives an app that is not running", () => {
    const lease = new MicLease(() => ({ fetch: (() => Promise.reject(new Error("down"))) as unknown as typeof fetch, port: 1, token: "t" }));
    expect(() => (lease.start(), lease.stop())).not.toThrow();
  });
});
