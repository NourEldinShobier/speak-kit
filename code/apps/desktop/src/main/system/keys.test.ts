import { afterEach, describe, expect, it, vi } from "vite-plus/test";

type Call = [vk: number, scan: number, flags: number, extra: number];

/** koffi is the system boundary: a fake user32 records every keybd_event and answers GetAsyncKeyState from `held`. */
async function press(platform: NodeJS.Platform, held: number[] = []) {
  const calls: Call[] = [];
  vi.resetModules();
  vi.doMock("koffi", () => ({
    default: {
      load: () => ({
        func: (sig: string) => (sig.includes("keybd_event") ? (...a: Call) => calls.push(a) : (vk: number) => (held.includes(vk) ? 0x8000 : 0)),
      }),
    },
  }));
  Object.defineProperty(process, "platform", { value: platform });
  const { sendCopyKeys } = await import("./keys");
  return { calls, run: sendCopyKeys };
}

const original = process.platform;
afterEach(() => {
  Object.defineProperty(process, "platform", { value: original });
  vi.doUnmock("koffi");
});

describe("sendCopyKeys", () => {
  it("presses Ctrl+C: Ctrl down, C down, C up, Ctrl up", async () => {
    const k = await press("win32");
    await k.run();
    expect(k.calls).toEqual([
      [0x11, 0, 0, 0],
      [0x43, 0, 0, 0],
      [0x43, 0, 2, 0],
      [0x11, 0, 2, 0],
    ]);
  });

  it("first releases Alt, Shift and Ctrl when the shortcut still holds them", async () => {
    const k = await press("win32", [0x12, 0x10]);
    await k.run();
    expect(k.calls.slice(0, 2)).toEqual([
      [0x12, 0, 2, 0],
      [0x10, 0, 2, 0],
    ]);
    expect(k.calls).toHaveLength(6);
  });

  it("refuses on other platforms", async () => {
    const k = await press("linux");
    await expect(k.run()).rejects.toThrow("only available on Windows");
    expect(k.calls).toEqual([]);
  });
});
