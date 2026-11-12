import { describe, expect, it, vi } from "vitest";
import type { Target } from "./session";
import { createSwitchFlow } from "./switch-flow";

const screen = (id: string): Target => ({ kind: "screen", displayId: id });

function setup(o: { phase?: string; pick?: (s: AbortSignal) => Promise<Target | null>; switched?: boolean } = {}) {
  const flags: boolean[] = [];
  const switchTarget = vi.fn(async (_t: Target) => o.switched ?? true);
  const flow = createSwitchFlow({
    session: () => ({ state: { phase: o.phase ?? "recording" } as never, switchTarget }),
    pick: o.pick ?? (async () => screen("d2")),
    setSwitching: (on) => flags.push(on),
  });
  return { flow, flags, switchTarget };
}

describe("switch target", () => {
  it("moves the recording to the chosen target and shows the capsule as choosing meanwhile", async () => {
    const t = setup();
    expect(await t.flow.run()).toBe("switched");
    expect(t.switchTarget).toHaveBeenCalledWith(screen("d2"));
    expect(t.flags).toEqual([true, false]);
  });

  it("Esc in the picker keeps recording the old target", async () => {
    const t = setup({ pick: async () => null });
    expect(await t.flow.run()).toBe("cancelled");
    expect(t.switchTarget).not.toHaveBeenCalled();
    expect(t.flags).toEqual([true, false]);
  });

  it("reports a switch the recorder refused", async () => {
    expect(await setup({ switched: false }).flow.run()).toBe("failed");
  });

  it("does nothing when no recording is running", async () => {
    const t = setup({ phase: "idle" });
    expect(await t.flow.run()).toBe("busy");
    expect(t.flags).toEqual([]);
  });

  it("a second switch while the picker is open is refused", async () => {
    let release: (t: Target | null) => void = () => {};
    const t = setup({ pick: () => new Promise((r) => (release = r)) });
    const first = t.flow.run();
    expect(await t.flow.run()).toBe("busy");
    release(screen("d2"));
    expect(await first).toBe("switched");
    const again = t.flow.run();
    release(screen("d3"));
    expect(await again).toBe("switched");
  });

  it("cancel aborts an open picker and never switches, even when it answers", async () => {
    let signal: AbortSignal | undefined;
    let release: (t: Target | null) => void = () => {};
    const t = setup({ pick: (s) => ((signal = s), new Promise((r) => (release = r))) });
    const run = t.flow.run();
    t.flow.cancel();
    expect(signal?.aborted).toBe(true);
    release(screen("d2"));
    expect(await run).toBe("cancelled");
    expect(t.switchTarget).not.toHaveBeenCalled();
    expect(t.flags.at(-1)).toBe(false);
  });

  it("clears the choosing state when the picker throws", async () => {
    const t = setup({ pick: async () => Promise.reject(new Error("overlay failed")) });
    await expect(t.flow.run()).rejects.toThrow("overlay failed");
    expect(t.flags).toEqual([true, false]);
    expect(await setup().flow.run()).toBe("switched");
  });
});
