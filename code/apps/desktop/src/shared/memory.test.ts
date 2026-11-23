import { describe, expect, it } from "vite-plus/test";
import { applyMemory, IDLE_UNLOAD_MS, serverOptions, type Tunable } from "./memory";

const recorder = () => {
  const calls: [string, unknown][] = [];
  const t: Tunable = {
    setIdleUnloadMs: (ms) => calls.push(["idle", ms]),
    setOnBattery: (on) => calls.push(["battery", on]),
  };
  return { t, calls };
};

describe("memory rules", () => {
  it("unloads the model after 5 minutes idle", () => {
    expect(IDLE_UNLOAD_MS).toBe(300000);
    expect(serverOptions()).toEqual({ idleUnloadMs: 300000 });
  });
  it("pushes the idle window and the power source to the server setters", () => {
    const { t, calls } = recorder();
    expect(applyMemory(t, true)).toEqual([]);
    expect(calls).toEqual([
      ["idle", 300000],
      ["battery", true],
    ]);
    const b = recorder();
    applyMemory(b.t, false);
    expect(b.calls.at(-1)).toEqual(["battery", false]);
  });
  it("reports setters the server build does not have", () => {
    expect(applyMemory({ setOnBattery: () => {} }, false)).toEqual(["setIdleUnloadMs"]);
    expect(applyMemory(null, false)).toHaveLength(2);
  });
});
