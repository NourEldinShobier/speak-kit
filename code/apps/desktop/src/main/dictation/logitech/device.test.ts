import { describe, expect, it } from "vite-plus/test";
import { connectDevice, type Transport } from "./device";

const frame = (...bytes: number[]) => [...bytes, ...Array.from({ length: 20 - bytes.length }, () => 0)];

/** A mouse on the other end: answers the requests of the handshake and the reads from a table of buttons. */
function fakeMouse(flagsOf: Record<number, number> = {}) {
  const written: number[][] = [];
  let data: (b: number[]) => void = () => undefined;
  const buttons = [
    [0x00, 0x52, 0, 0, 0x20],
    [0x00, 0xc3, 0, 0, 0x40],
  ];
  const t: Transport = {
    write(b) {
      written.push(b);
      const [, index, feature, fnSw, p0, p1] = b;
      const fn = fnSw! >> 4;
      const reply = (...params: number[]) => queueMicrotask(() => data(frame(0x11, index!, feature!, 0x07 | (fn << 4), ...params)));
      if (feature === 0 && fn === 1) return index === 0xff ? reply(4, 5, 0xaa) : undefined;
      if (feature === 0 && fn === 0) return reply(13);
      if (feature === 13 && fn === 0) return reply(buttons.length);
      if (feature === 13 && fn === 1) return reply(...buttons[p0!]!);
      if (feature === 13 && fn === 2) return reply(p0!, p1!, flagsOf[(p0! << 8) | p1!] ?? 0);
      if (feature === 13 && fn === 3) return reply(p0!, p1!);
    },
    onData: (cb) => void (data = cb),
    onError: () => undefined,
    close: () => undefined,
  };
  return { t, written, send: (...b: number[]) => data(frame(...b)) };
}

describe("a HID++ device", () => {
  it("finds the feature and the buttons, and reads and writes the divert", async () => {
    const m = fakeMouse({ 0xc3: 0x01 });
    const dev = (await connectDevice(m.t, 50))!;
    expect(dev.controls).toEqual([
      { cid: 0x52, divertable: true },
      { cid: 0xc3, divertable: true },
    ]);
    expect(await dev.flagsOf(0xc3)).toBe(1);
    await dev.setDivert(0x52, true);
    expect(m.written.at(-1)).toEqual(frame(0x11, 0xff, 13, 0x37, 0x00, 0x52, 0x03));
  });

  it("is not a device with buttons when nothing answers the ping", async () => {
    const t: Transport = { write: () => undefined, onData: () => undefined, onError: () => undefined, close: () => undefined };
    expect(await connectDevice(t, 5)).toBeNull();
  });

  it("reports presses and releases from the lists of held buttons, and ignores frames meant for other programs", async () => {
    const m = fakeMouse();
    const dev = (await connectDevice(m.t, 50))!;
    const seen: string[] = [];
    dev.onPress((cid, down) => seen.push(`${cid.toString(16)} ${down ? "down" : "up"}`));
    m.send(0x11, 0xff, 13, 0x00, 0x00, 0xc3);
    m.send(0x11, 0xff, 13, 0x05, 0x00, 0x52);
    m.send(0x11, 0xff, 13, 0x00, 0x00, 0xc3, 0x00, 0x52);
    m.send(0x11, 0xff, 13, 0x00);
    expect(seen).toEqual(["c3 down", "52 down", "c3 up", "52 up"]);
  });

  it("sees a press again after its release was lost and the button was diverted again", async () => {
    const m = fakeMouse();
    const dev = (await connectDevice(m.t, 50))!;
    const seen: string[] = [];
    dev.onPress((cid, down) => seen.push(`${cid.toString(16)} ${down ? "down" : "up"}`));
    m.send(0x11, 0xff, 13, 0x00, 0x00, 0xc3);
    await dev.setDivert(0xc3, true);
    m.send(0x11, 0xff, 13, 0x00, 0x00, 0xc3);
    expect(seen).toEqual(["c3 down", "c3 down"]);
  });

  it("asks for the divert to end without waiting", async () => {
    const m = fakeMouse();
    const dev = (await connectDevice(m.t, 50))!;
    dev.releaseNow([0xd7]);
    expect(m.written.at(-1)).toEqual(frame(0x11, 0xff, 13, 0x37, 0x00, 0xd7, 0x02));
  });
});
