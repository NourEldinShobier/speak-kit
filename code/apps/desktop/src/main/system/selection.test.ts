import { describe, expect, it } from "vite-plus/test";
import { captureSelection, type ClipboardIO } from "./selection";

function fakeClipboard(initial: string) {
  let text = initial;
  const calls: string[] = [];
  const clip: ClipboardIO = {
    text: () => text,
    snapshot: () => text,
    restore: (s) => {
      text = s as string;
      calls.push("restore");
    },
    clear: () => {
      text = "";
      calls.push("clear");
    },
  };
  return { clip, calls, set: (t: string) => (text = t), get: () => text };
}

describe("captureSelection", () => {
  it("clears the clipboard, presses copy, returns the selection and puts the old clipboard back", async () => {
    const c = fakeClipboard("old copy");
    const out = await captureSelection({ clip: c.clip, copy: async () => c.set("selected words"), sleep: async () => {} });
    expect(out).toBe("selected words");
    expect(c.calls).toEqual(["clear", "restore"]);
    expect(c.get()).toBe("old copy");
  });

  it("waits for a slow app, then gives up with an empty string and still restores", async () => {
    const c = fakeClipboard("keep me");
    let slept = 0;
    const slow = await captureSelection({
      clip: c.clip,
      copy: async () => {},
      sleep: async () => {
        slept += 25;
        if (slept === 100) c.set("late text");
      },
    });
    expect(slow).toBe("late text");
    expect(c.get()).toBe("keep me");
    const none = await captureSelection({ clip: c.clip, copy: async () => {}, sleep: async () => {}, timeoutMs: 100 });
    expect(none).toBe("");
    expect(c.get()).toBe("keep me");
  });

  it("restores the clipboard when pressing the keys fails", async () => {
    const c = fakeClipboard("precious");
    await expect(captureSelection({ clip: c.clip, copy: () => Promise.reject(new Error("no keys")), sleep: async () => {} })).rejects.toThrow("no keys");
    expect(c.get()).toBe("precious");
  });
});
