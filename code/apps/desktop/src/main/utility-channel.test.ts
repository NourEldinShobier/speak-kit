import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { channelOf } from "./utility-channel";

class FakeChild extends EventEmitter {
  pid: number | undefined = undefined;
  kills = 0;
  sent: unknown[] = [];
  postMessage = (m: unknown) => void this.sent.push(m);
  kill = () => {
    if (this.pid === undefined) return false; // a real utility process ignores kill before spawn
    this.kills++;
    queueMicrotask(() => this.emit("exit", 0));
    return true;
  };
  spawn(pid: number) {
    this.pid = pid;
    this.emit("spawn");
  }
}

afterEach(() => vi.useRealTimers());

describe("utility channel", () => {
  it("passes messages and exits both ways", () => {
    const child = new FakeChild();
    const ch = channelOf(child);
    const got: unknown[] = [];
    const exits: unknown[] = [];
    ch.on("message", (m) => got.push(m));
    ch.on("exit", (c) => exits.push(c));
    ch.post({ a: 1 });
    child.emit("message", { status: "ready" });
    child.emit("exit", 7);
    expect(child.sent).toEqual([{ a: 1 }]);
    expect(got).toEqual([{ status: "ready" }]);
    expect(exits).toEqual([7]);
  });

  it("kills a running process and resolves on its exit", async () => {
    const child = new FakeChild();
    child.pid = 12;
    await channelOf(child).terminate();
    expect(child.kills).toBe(1);
  });

  it("resolves at once when the process already exited", async () => {
    const child = new FakeChild();
    child.pid = 12;
    const ch = channelOf(child);
    child.emit("exit", 0);
    await ch.terminate();
    expect(child.kills).toBe(0);
  });

  it("kills a process that is terminated before it has spawned, as soon as it spawns", async () => {
    const child = new FakeChild();
    const done = channelOf(child).terminate();
    expect(child.kills).toBe(0);
    child.spawn(99);
    await done;
    expect(child.kills).toBe(1);
  });

  it("gives up waiting when the process never exits", async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const done = channelOf(child, 1000).terminate();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(done).resolves.toBeUndefined();
    expect(child.kills).toBe(0);
  });
});
