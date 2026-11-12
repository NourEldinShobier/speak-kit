import { describe, expect, it } from "vite-plus/test";
import type { Foreground } from "./foreground";
import { createInput } from "./input";
import type { KeyInput, Win32 } from "./native";

const KEYUP = 0x2;
const EXTENDED = 0x1;

function rig(opts: { ctrlDown?: boolean; refuseAfter?: number; foreground?: string[]; setForeground?: boolean } = {}) {
  const sent: KeyInput[][] = [];
  const fgQueue = [...(opts.foreground ?? ["1"])];
  let current = fgQueue[0] ?? "1";
  const w = {
    foregroundWindow: () => ({ id: current }),
    address: (h: { id: string } | null) => h?.id ?? "0",
    keyboardLayout: () => null,
    windowOwner: () => ({ pid: 1, tid: 1 }),
    mapVirtualKey: (vk: number) => vk,
    keyIsDown: (vk: number) => vk === 0x11 && !!opts.ctrlDown,
    sendInput: (events: KeyInput[]) => {
      sent.push(events);
      return opts.refuseAfter === undefined ? events.length : Math.min(events.length, opts.refuseAfter);
    },
    setForeground: () => {
      if (fgQueue.length > 1) fgQueue.shift();
      current = fgQueue[0] ?? current;
      return opts.setForeground ?? true;
    },
  } as unknown as Win32;
  return { input: createInput(w, {} as Foreground), sent };
}

const keys = (events: KeyInput[]) => events.map((e) => `${e.u.ki.wVk.toString(16)}${e.u.ki.dwFlags & KEYUP ? "^" : "v"}`);

describe("pressPaste", () => {
  it("Ctrl+V presses and releases Ctrl around V", () => {
    const { input, sent } = rig();
    expect(input.pressPaste("ctrl-v")).toBe(true);
    expect(keys(sent[0]!)).toEqual(["a2v", "56v", "56^", "a2^"]);
  });

  it("Ctrl+Shift+V adds Shift", () => {
    const { input, sent } = rig();
    input.pressPaste("ctrl-shift-v");
    expect(keys(sent[0]!)).toEqual(["a2v", "a0v", "56v", "56^", "a2^", "a0^"]);
  });

  it("Shift+Insert uses the extended Insert key and no Ctrl", () => {
    const { input, sent } = rig();
    input.pressPaste("shift-insert");
    expect(keys(sent[0]!)).toEqual(["a0v", "2dv", "2d^", "a0^"]);
    expect(sent[0]!.filter((e) => e.u.ki.wVk === 0x2d).every((e) => (e.u.ki.dwFlags & EXTENDED) !== 0)).toBe(true);
  });

  it("does not press a Ctrl the person is already holding", () => {
    const { input, sent } = rig({ ctrlDown: true });
    input.pressPaste("ctrl-v");
    expect(keys(sent[0]!)).toEqual(["56v", "56^"]);
  });

  it("releases the keys it pressed when the system takes only part of them", () => {
    const { input, sent } = rig({ refuseAfter: 2 });
    expect(input.pressPaste("ctrl-shift-v")).toBe(false);
    expect(keys(sent[1]!)).toEqual(["a2^", "a0^"]);
  });
});

describe("focus", () => {
  it("is true at once when the window is already in front", async () => {
    const { input } = rig({ foreground: ["7"] });
    expect(await input.focus("7")).toBe(true);
  });

  it("brings another window to the front and confirms it", async () => {
    const { input } = rig({ foreground: ["1", "7"] });
    expect(await input.focus("7")).toBe(true);
  });

  it("is false when Windows refuses", async () => {
    const { input } = rig({ foreground: ["1", "7"], setForeground: false });
    expect(await input.focus("7")).toBe(false);
  });

  it("is false when the window never reaches the front within half a second", async () => {
    const { input } = rig({ foreground: ["1"] });
    const started = Date.now();
    expect(await input.focus("7")).toBe(false);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
