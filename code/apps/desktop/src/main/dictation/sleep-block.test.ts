import { describe, expect, it } from "vite-plus/test";
import { createSleepBlock } from "./sleep-block";

function rig(opts: { enabled?: boolean; failStart?: boolean; failStop?: boolean } = {}) {
  const calls: string[] = [];
  const warnings: string[] = [];
  const set = createSleepBlock(
    {
      start: () => {
        if (opts.failStart) throw new Error("denied");
        calls.push("start");
        return 7;
      },
      stop: (id) => {
        calls.push(`stop ${id}`);
        if (opts.failStop) throw new Error("gone");
      },
    },
    () => opts.enabled ?? true,
    (why) => warnings.push(why),
  );
  return { set, calls, warnings };
}

describe("sleep block", () => {
  it("blocks for the length of a recording and releases at the end", () => {
    const r = rig();
    r.set(true);
    r.set(false);
    expect(r.calls).toEqual(["start", "stop 7"]);
  });
  it("asks once however often the recording state repeats, and releases once", () => {
    const r = rig();
    r.set(true);
    r.set(true);
    r.set(false);
    r.set(false);
    expect(r.calls).toEqual(["start", "stop 7"]);
  });
  it("does nothing when the setting is off", () => {
    const r = rig({ enabled: false });
    r.set(true);
    r.set(false);
    expect(r.calls).toEqual([]);
  });
  it("warns and carries on when the system refuses, and tries again at the next recording", () => {
    const r = rig({ failStart: true });
    r.set(true);
    r.set(false);
    r.set(true);
    expect(r.warnings).toEqual(["Error: denied", "Error: denied"]);
    expect(r.calls).toEqual([]);
  });
  it("a release that fails is reported and the next recording can block again", () => {
    const r = rig({ failStop: true });
    r.set(true);
    r.set(false);
    r.set(true);
    expect(r.warnings).toEqual(["Error: gone"]);
    expect(r.calls).toEqual(["start", "stop 7", "start"]);
  });
});
