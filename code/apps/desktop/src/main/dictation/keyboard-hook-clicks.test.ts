import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createKeyboardHook, type HookBackend, type HookClick } from "./keyboard-hook";

const MARKER = 7;
const INJECTED = 0x10;

function setup(o: { mouse?: boolean; refuse?: boolean } = {}) {
  let onClick: ((c: HookClick) => boolean) | undefined;
  let removed = 0;
  const backend: HookBackend = {
    install: () => ({ uninstall() {} }),
    keyIsDown: () => false,
    ...(o.mouse !== false && {
      installMouse: (click: (c: HookClick) => boolean) => {
        if (o.refuse) throw new Error("refused");
        onClick = click;
        return { uninstall: () => void removed++ };
      },
    }),
  };
  const hook = createKeyboardHook(backend, { marker: MARKER });
  return { hook, press: (c: Partial<HookClick>) => onClick!({ vk: 0x01, down: true, extra: 0, flags: 0, ...c }), removed: () => removed };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("watching clicks", () => {
  it("reports a left button press on a later turn and never holds the click back", async () => {
    const t = setup();
    const clicks: string[] = [];
    t.hook.watchClicks(() => clicks.push("click"));
    expect(t.press({})).toBe(false);
    expect(clicks).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(clicks).toEqual(["click"]);
  });

  it("ignores a release, the other buttons and a click this app made itself", async () => {
    const t = setup();
    let n = 0;
    t.hook.watchClicks(() => void n++);
    for (const c of [{ down: false }, { vk: 0x02 }, { vk: 0x04 }, { vk: 0x05 }, { extra: MARKER, flags: INJECTED }]) expect(t.press(c)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(n).toBe(0);
  });

  it("removes the mouse hook when stopped", () => {
    const t = setup();
    const stop = t.hook.watchClicks(() => undefined);
    stop?.();
    expect(t.removed()).toBe(1);
  });

  it("gives nothing where there is no mouse hook or the system refuses it", () => {
    expect(setup({ mouse: false }).hook.watchClicks(() => undefined)).toBeUndefined();
    expect(setup({ refuse: true }).hook.watchClicks(() => undefined)).toBeUndefined();
  });
});
