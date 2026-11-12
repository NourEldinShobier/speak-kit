import { describe, expect, it, vi } from "vitest";
import { finishForQuit } from "./quit";

const fake = (phase: string, idle: Promise<void> = Promise.resolve()) => ({ state: { phase } as never, stop: vi.fn(), idle: () => idle });

describe("finishing at quit", () => {
  it("does nothing when idle or picking", () => {
    for (const phase of ["idle", "picking"]) {
      const s = fake(phase);
      expect(finishForQuit(s, 10)).toBeUndefined();
      expect(s.stop).not.toHaveBeenCalled();
    }
  });

  it("stops a recording and waits for it to be saved", async () => {
    const s = fake("recording");
    await finishForQuit(s, 10_000);
    expect(s.stop).toHaveBeenCalledOnce();
  });

  it("only waits for a capture that is already being saved", async () => {
    const s = fake("finishing");
    await finishForQuit(s, 10_000);
    expect(s.stop).not.toHaveBeenCalled();
  });

  it("gives up waiting after the limit", async () => {
    vi.useFakeTimers();
    const s = fake("finishing", new Promise(() => {}));
    const done = vi.fn();
    void finishForQuit(s, 30_000)?.then(done);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
