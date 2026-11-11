import { EventEmitter } from "node:events";
import { describe, expect, it } from "vite-plus/test";
import { resyncOnPower } from "./power-resync";

describe("resync on power events", () => {
  it("resyncs on lock, unlock and resume, and on nothing else", () => {
    const power = new EventEmitter();
    let n = 0;
    resyncOnPower(power, () => void n++);
    power.emit("lock-screen");
    power.emit("unlock-screen");
    power.emit("resume");
    power.emit("suspend");
    power.emit("on-battery");
    expect(n).toBe(3);
  });

  it("stops listening when told to", () => {
    const power = new EventEmitter();
    let n = 0;
    resyncOnPower(power, () => void n++)();
    power.emit("lock-screen");
    power.emit("resume");
    expect(n).toBe(0);
    expect(power.listenerCount("lock-screen") + power.listenerCount("unlock-screen") + power.listenerCount("resume")).toBe(0);
  });
});
