import { describe, expect, it } from "vite-plus/test";
import { applyMemory, IDLE_MS, serverOptions, type Tunable } from "./memory";

const recorder = () => {
  const calls: [string, unknown][] = [];
  const t: Tunable = {
    setIdleUnloadMs: (ms) => calls.push(["idle", ms]),
    setOnBattery: (on) => calls.push(["battery", on]),
  };
  return { t, calls };
};

describe("Settings > Memory wiring", () => {
  it("maps the idle choices to milliseconds, 0 for never", () => {
    expect(IDLE_MS).toEqual({ "1": 60000, "5": 300000, "15": 900000, never: 0 });
    expect(serverOptions({ idleUnload: "15", loadAtStart: true })).toEqual({ idleUnloadMs: 900000, loadAtStart: true });
  });
  it("pushes idle unload and battery saver to the server setters", () => {
    const { t, calls } = recorder();
    expect(applyMemory(t, { idleUnload: "1", batterySaver: true }, true)).toEqual([]);
    expect(calls).toEqual([["idle", 60000], ["battery", true]]);
  });
  it("battery saver only counts while on battery", () => {
    const a = recorder();
    applyMemory(a.t, { idleUnload: "5", batterySaver: false }, true);
    expect(a.calls.at(-1)).toEqual(["battery", false]);
    const b = recorder();
    applyMemory(b.t, { idleUnload: "5", batterySaver: true }, false);
    expect(b.calls.at(-1)).toEqual(["battery", false]);
  });
  it("reports setters the server build does not have", () => {
    expect(applyMemory({ setOnBattery: () => {} }, { idleUnload: "5", batterySaver: true }, false)).toEqual(["setIdleUnloadMs"]);
    expect(applyMemory(null, { idleUnload: "5", batterySaver: true }, false)).toHaveLength(2);
  });
});
