import { describe, expect, it } from "vitest";
import type { Notice } from "../../shared/capture/notices";
import { createWriteGuard } from "./write-guard";

const setup = () => {
  const notices: Notice[] = [];
  const logs: string[] = [];
  return { notices, logs, guard: createWriteGuard({ notify: (n) => notices.push(n), log: (l) => logs.push(l) }) };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("write guard", () => {
  it("passes successful writes without a notice", async () => {
    const { guard, notices } = setup();
    guard.watch(Promise.resolve());
    await flush();
    expect(notices).toEqual([]);
    expect(guard.failures).toBe(0);
  });
  it("raises one notice for many failed writes and counts every one", async () => {
    const { guard, notices, logs } = setup();
    for (let i = 0; i < 3; i++) guard.watch(Promise.reject(new Error("EIO")));
    await flush();
    expect(notices.map((n) => n.code)).toEqual(["write-failed"]);
    expect(guard.failures).toBe(3);
    expect(logs).toHaveLength(3);
    expect(logs[0]).toBe("capture write failed (1): EIO");
  });
  it("tells the recording to end on the first failed write only, so later chunks do not queue", async () => {
    const stops: number[] = [];
    const guard = createWriteGuard({ notify: () => {}, log: () => {}, onFirstFailure: () => stops.push(1) });
    guard.watch(Promise.reject(new Error("EIO")));
    guard.watch(Promise.reject(new Error("EIO")));
    await flush();
    expect(stops).toEqual([1]);
    guard.reset();
    guard.watch(Promise.reject(new Error("EIO")));
    await flush();
    expect(stops).toEqual([1, 1]);
  });
  it("says the disk is full for a full disk", async () => {
    const { guard, notices } = setup();
    guard.watch(Promise.reject(Object.assign(new Error("write failed"), { code: "ENOSPC" })));
    await flush();
    expect(notices.map((n) => n.code)).toEqual(["no-space"]);
  });
  it("logs a thrown value that is not an Error", async () => {
    const { guard, logs } = setup();
    guard.watch(Promise.reject("gone"));
    await flush();
    expect(logs).toEqual(["capture write failed (1): gone"]);
  });
  it("starts over for the next capture", async () => {
    const { guard, notices } = setup();
    guard.watch(Promise.reject(new Error("x")));
    await flush();
    guard.reset();
    expect(guard.failures).toBe(0);
    guard.watch(Promise.reject(new Error("x")));
    await flush();
    expect(notices).toHaveLength(2);
  });
});
