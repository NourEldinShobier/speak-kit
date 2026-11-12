import { describe, expect, it } from "vitest";
import { createBoundedQueue } from "./index";

describe("bounded queue", () => {
  it("keeps order and returns nothing while there is room", () => {
    const q = createBoundedQueue<number>(3);
    expect([q.push(1), q.push(2), q.push(3)]).toEqual([undefined, undefined, undefined]);
    expect([q.shift(), q.shift(), q.shift(), q.shift()]).toEqual([1, 2, 3, undefined]);
  });
  it("drops the oldest item when full and counts it", () => {
    const q = createBoundedQueue<string>(2);
    q.push("a");
    q.push("b");
    expect(q.push("c")).toBe("a");
    expect(q.size).toBe(2);
    expect(q.dropped).toBe(1);
    expect(q.shift()).toBe("b");
  });
  it("a huge burst never grows past the limit", () => {
    const q = createBoundedQueue<number>(5);
    for (let i = 0; i < 100_000; i++) q.push(i);
    expect(q.size).toBe(5);
    expect(q.dropped).toBe(99_995);
    expect(q.shift()).toBe(99_995);
  });
  it("rejects a limit below one", () => {
    expect(() => createBoundedQueue(0)).toThrow(RangeError);
    expect(() => createBoundedQueue(Number.NaN)).toThrow(RangeError);
  });
});
