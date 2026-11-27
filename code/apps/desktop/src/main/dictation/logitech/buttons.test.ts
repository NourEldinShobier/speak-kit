import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createButtons } from "./buttons";
import { connectDevice, type ReprogDevice, type Transport } from "./device";
import type { Control } from "./hidpp";

vi.mock("./device", () => ({ connectDevice: vi.fn() }));

const CONTROLS: Control[] = [
  { cid: 0x50, divertable: true },
  { cid: 0x51, divertable: true },
  { cid: 0x52, divertable: true },
  { cid: 0xc3, divertable: true },
  { cid: 0xd7, divertable: true },
];

/** A mouse as the protocol layer sees it: reporting flags per button and a log of what was written. */
function fakeDevice(flags: Record<number, number> = {}, controls: Control[] = CONTROLS) {
  const log: string[] = [];
  let press: (cid: number, down: boolean) => void = () => undefined;
  let lost: () => void = () => undefined;
  const dev: ReprogDevice = {
    controls,
    flagsOf: async (cid) => flags[cid] ?? 0,
    setDivert: async (cid, on) => {
      log.push(`${on ? "divert" : "undivert"} ${cid.toString(16)}`);
      flags[cid] = on ? 1 : 0;
    },
    releaseNow: (cids) => void log.push(`release ${cids.map((c) => c.toString(16)).join(",")}`),
    onPress: (cb) => void (press = cb),
    onLost: (cb) => void (lost = cb),
    close: () => void log.push("close"),
  };
  return { dev, log, flags, press: (cid: number, down: boolean) => press(cid, down), lose: () => lost() };
}

const setup = (devices: ReprogDevice[]) => {
  vi.mocked(connectDevice).mockReset();
  for (const d of devices) vi.mocked(connectDevice).mockResolvedValueOnce(d);
  const open = async () => (devices.length > 0 ? [{} as Transport] : []);
  const buttons = createButtons({ open, checkMs: 10_000, learnMs: 15_000, platform: "win32" });
  const events: string[] = [];
  buttons.onButton((cid, down) => events.push(`${cid.toString(16)} ${down ? "down" : "up"}`));
  return { buttons, events };
};

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("assigned buttons", () => {
  it("diverts the assigned button and passes its presses on, and only its", async () => {
    const m = fakeDevice();
    const s = setup([m.dev]);
    s.buttons.assign([0xd7]);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.log).toEqual(["divert d7"]);
    m.press(0xd7, true);
    m.press(0xc3, true);
    m.press(0xd7, false);
    expect(s.events).toEqual(["d7 down", "d7 up"]);
    s.buttons.dispose();
  });

  it("does not divert a button that another program already diverted, and still passes its presses on", async () => {
    const m = fakeDevice({ 0xc3: 1 });
    const s = setup([m.dev]);
    s.buttons.assign([0xc3]);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.log).toEqual([]);
    m.press(0xc3, true);
    expect(s.events).toEqual(["c3 down"]);
    s.buttons.assign([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.log).toEqual(["close"]);
    expect(m.flags[0xc3]).toBe(1);
  });

  it("never diverts left or right click", async () => {
    const m = fakeDevice();
    const s = setup([m.dev]);
    s.buttons.assign([0x50, 0x51]);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.log).toEqual([]);
    s.buttons.dispose();
  });

  it("releases a divert when the shortcut is cleared and stops checking", async () => {
    const m = fakeDevice();
    const s = setup([m.dev]);
    s.buttons.assign([0xd7]);
    await vi.advanceTimersByTimeAsync(0);
    s.buttons.assign([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.log).toEqual(["divert d7", "undivert d7", "close"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("diverts again at the next check when the mouse reset", async () => {
    const m = fakeDevice();
    const s = setup([m.dev]);
    s.buttons.assign([0xd7]);
    await vi.advanceTimersByTimeAsync(0);
    m.flags[0xd7] = 0;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(m.log).toEqual(["divert d7", "divert d7"]);
    s.buttons.dispose();
  });

  it("connects again at the next check when the mouse was gone", async () => {
    const first = fakeDevice();
    const s = setup([first.dev]);
    s.buttons.assign([0xd7]);
    await vi.advanceTimersByTimeAsync(0);
    first.lose();
    const second = fakeDevice();
    vi.mocked(connectDevice).mockResolvedValueOnce(second.dev);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(second.log).toEqual(["divert d7"]);
    s.buttons.dispose();
  });

  it("asks the mouse to release its diverts when the app quits, without waiting", async () => {
    const m = fakeDevice();
    const s = setup([m.dev]);
    s.buttons.assign([0xd7, 0x52]);
    await vi.advanceTimersByTimeAsync(0);
    s.buttons.dispose();
    expect(m.log.slice(-2)).toEqual(["release d7,52", "close"]);
  });

  it("does nothing, and loads nothing, off Windows", async () => {
    const open = vi.fn(async () => []);
    const b = createButtons({ open, platform: "darwin" });
    b.assign([0xd7]);
    await vi.advanceTimersByTimeAsync(0);
    expect(open).not.toHaveBeenCalled();
    expect(await b.learn()).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("learning a button", () => {
  it("diverts the free buttons, returns the first pressed one with its label, and restores", async () => {
    const m = fakeDevice({ 0xc3: 1 });
    const s = setup([m.dev]);
    const learned = s.buttons.learn();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.log).toEqual(["divert 52", "divert d7"]);
    m.press(0xd7, true);
    expect(await learned).toEqual({ ok: true, id: "logi:0x00d7", label: "DPI button" });
    expect(m.log).toEqual(["divert 52", "divert d7", "undivert 52", "undivert d7", "close"]);
    expect(m.flags[0xc3]).toBe(1);
  });

  it("learns a button another program diverted", async () => {
    const m = fakeDevice({ 0xc3: 1 });
    const s = setup([m.dev]);
    const learned = s.buttons.learn();
    await vi.advanceTimersByTimeAsync(0);
    m.press(0xc3, true);
    expect(await learned).toEqual({ ok: true, id: "logi:0x00c3", label: "Gesture button" });
  });

  it("names a button it has no name for by its code", async () => {
    const m = fakeDevice({}, [...CONTROLS, { cid: 0x01a0, divertable: true }]);
    const s = setup([m.dev]);
    const learned = s.buttons.learn();
    await vi.advanceTimersByTimeAsync(0);
    m.press(0x01a0, true);
    expect(await learned).toEqual({ ok: true, id: "logi:0x01a0", label: "Button 0x01a0" });
  });

  it("does not pass the press on to the shortcut that uses it, and ignores left and right click", async () => {
    const m = fakeDevice();
    const s = setup([m.dev]);
    s.buttons.assign([0xd7]);
    await vi.advanceTimersByTimeAsync(0);
    const learned = s.buttons.learn();
    await vi.advanceTimersByTimeAsync(0);
    m.press(0x50, true);
    m.press(0xd7, true);
    expect(s.events).toEqual([]);
    expect(await learned).toEqual({ ok: true, id: "logi:0x00d7", label: "DPI button" });
    expect(m.flags[0xd7]).toBe(1);
    s.buttons.dispose();
  });

  it("times out after 15 seconds and restores", async () => {
    const m = fakeDevice();
    const s = setup([m.dev]);
    const learned = s.buttons.learn();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await learned).toEqual({ ok: false, reason: "timeout" });
    expect(m.flags).toEqual({ 0x52: 0, 0xc3: 0, 0xd7: 0 });
  });

  it("can be cancelled and restores", async () => {
    const m = fakeDevice();
    const s = setup([m.dev]);
    const learned = s.buttons.learn();
    await vi.advanceTimersByTimeAsync(0);
    s.buttons.cancelLearn();
    expect(await learned).toEqual({ ok: false, reason: "cancelled" });
    expect(m.flags).toEqual({ 0x52: 0, 0xc3: 0, 0xd7: 0 });
  });

  it("is unavailable when no mouse answers", async () => {
    const s = setup([]);
    expect(await s.buttons.learn()).toEqual({ ok: false, reason: "unavailable" });
  });
});
