import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createRestoreGuard, type ClipboardPort } from "./restore-guard";

/** An in-memory clipboard whose sequence number moves on every write, like the real one. */
function fakeClipboard(initial: string | null) {
  let content = initial;
  let seq = 1;
  const log: string[] = [];
  const port: ClipboardPort = {
    snapshot: async () => (content === null ? [] : [content]),
    writeText: async (t) => {
      content = t;
      seq++;
    },
    restore: async (s) => {
      content = (s as string[])[0] ?? null;
      seq++;
      log.push(`restore ${content}`);
    },
    sequence: () => seq,
  };
  return {
    port,
    log,
    get content() {
      return content;
    },
    /** Another program copies something. */
    copy(t: string) {
      content = t;
      seq++;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("restore guard", () => {
  it("puts the old clipboard back after the delay", async () => {
    const clip = fakeClipboard("old");
    const g = createRestoreGuard(clip.port);
    await g.stage("dictated");
    g.restoreAfter(500);
    expect(clip.content).toBe("dictated");
    await vi.advanceTimersByTimeAsync(499);
    expect(clip.content).toBe("dictated");
    await vi.advanceTimersByTimeAsync(1);
    expect(clip.content).toBe("old");
    await g.settled();
  });

  it("restores an empty clipboard to empty", async () => {
    const clip = fakeClipboard(null);
    const g = createRestoreGuard(clip.port);
    await g.stage("dictated");
    g.restoreAfter(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(clip.log).toEqual(["restore null"]);
    expect(clip.content).toBeNull();
  });

  it("does not overwrite something the user copied in the meantime", async () => {
    const clip = fakeClipboard("old");
    const g = createRestoreGuard(clip.port);
    await g.stage("dictated");
    g.restoreAfter(500);
    await vi.advanceTimersByTimeAsync(200);
    clip.copy("user copy");
    await vi.advanceTimersByTimeAsync(300);
    expect(clip.content).toBe("user copy");
    expect(clip.log).toEqual([]);
    await g.settled();
  });

  it("keeps the original clipboard when a second paste comes before the first restore", async () => {
    const clip = fakeClipboard("old");
    const g = createRestoreGuard(clip.port);
    await g.stage("first");
    g.restoreAfter(500);
    await vi.advanceTimersByTimeAsync(100);
    await g.stage("second");
    g.restoreAfter(500);
    await vi.advanceTimersByTimeAsync(499);
    expect(clip.content).toBe("second");
    await vi.advanceTimersByTimeAsync(1);
    expect(clip.content).toBe("old");
    expect(clip.log).toEqual(["restore old"]);
  });

  it("snapshots the user's new copy when it came between two pastes", async () => {
    const clip = fakeClipboard("old");
    const g = createRestoreGuard(clip.port);
    await g.stage("first");
    g.restoreAfter(500);
    clip.copy("user copy");
    await g.stage("second");
    g.restoreAfter(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(clip.content).toBe("user copy");
  });

  it("keep leaves the text on the clipboard", async () => {
    const clip = fakeClipboard("old");
    const g = createRestoreGuard(clip.port);
    await g.stage("dictated");
    g.keep();
    g.restoreAfter(500);
    await vi.advanceTimersByTimeAsync(1000);
    expect(clip.content).toBe("dictated");
    await g.settled();
  });

  it("flush restores at once", async () => {
    const clip = fakeClipboard("old");
    const g = createRestoreGuard(clip.port);
    await g.stage("dictated");
    g.restoreAfter(3000);
    await g.flush();
    expect(clip.content).toBe("old");
    await g.settled();
  });

  it("restores nothing when the clipboard could not be read", async () => {
    const clip = fakeClipboard("old");
    const g = createRestoreGuard({ ...clip.port, snapshot: async () => null });
    await g.stage("dictated");
    g.restoreAfter(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(clip.content).toBe("dictated");
  });

  it("leaves the text in place when the restore itself fails", async () => {
    const clip = fakeClipboard("old");
    const g = createRestoreGuard({
      ...clip.port,
      restore: async () => {
        throw new Error("clipboard busy");
      },
    });
    await g.stage("dictated");
    g.restoreAfter(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(clip.content).toBe("dictated");
    await g.settled();
  });
});
