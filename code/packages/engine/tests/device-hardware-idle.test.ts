import { describe, expect, it } from "vite-plus/test";
import {
  IdleRelease,
  accurateModelFits,
  hasFastGraphics,
  checkFloor,
  deviceInUse,
  forgetFailure,
  isOutOfMemory,
  onGpuFailure,
  pickFaster,
  planDevice,
  recordFailure,
  type FailedDevice,
  type IdleDeps,
  type IdleMinutes,
} from "../src";

const rtx = { name: "NVIDIA RTX 3060", driver: "31.0.15.5123" };
const igpu = { name: "Intel UHD 620", driver: "27.20.100.8935", integrated: true };

describe("planDevice", () => {
  it("CPU choice loads no graphics runtime, whatever is installed", () => {
    expect(planDevice({ choice: "cpu", gpu: rtx, failed: [] })).toEqual({ gpu: false, reason: "chose-cpu", timeIntegrated: false });
  });
  it("graphics card choice is honoured even for a card that failed before", () => {
    const failed: FailedDevice[] = [{ ...rtx, reason: "x", at: 1 }];
    expect(planDevice({ choice: "gpu", gpu: rtx, failed })).toEqual({ gpu: true, reason: "chose-gpu", timeIntegrated: false });
  });
  it("auto without a card runs on the CPU", () => {
    expect(planDevice({ choice: "auto", gpu: undefined, failed: [] })).toEqual({ gpu: false, reason: "no-gpu", timeIntegrated: false });
  });
  it("auto skips a card that failed on this driver and tries it again on a new driver", () => {
    const failed: FailedDevice[] = [{ ...rtx, reason: "x", at: 1 }];
    expect(planDevice({ choice: "auto", gpu: rtx, failed }).reason).toBe("failed-before");
    expect(planDevice({ choice: "auto", gpu: { ...rtx, driver: "31.0.15.9999" }, failed })).toEqual({ gpu: true, reason: "auto", timeIntegrated: false });
  });
  it("auto times an integrated card once, then follows the measurement", () => {
    expect(planDevice({ choice: "auto", gpu: igpu, failed: [] })).toEqual({ gpu: true, reason: "auto", timeIntegrated: true });
    expect(planDevice({ choice: "auto", gpu: igpu, failed: [], timed: "cpu" })).toEqual({ gpu: false, reason: "auto", timeIntegrated: false });
    expect(planDevice({ choice: "auto", gpu: igpu, failed: [], timed: "gpu" })).toEqual({ gpu: true, reason: "auto", timeIntegrated: false });
  });
});

describe("graphics failures", () => {
  it.each(["VK_ERROR_OUT_OF_DEVICE_MEMORY", "ggml_vulkan: out of memory", "Failed to allocate buffer", "std::bad_alloc", "CUDA error: out of memory"])("%s is out of memory", (m) => {
    expect(isOutOfMemory(m)).toBe(true);
    expect(onGpuFailure(m)).toEqual({ markFailed: false, runOnCpu: true });
  });
  it("another failure marks the card", () => {
    expect(isOutOfMemory("no Vulkan device")).toBe(false);
    expect(onGpuFailure("no Vulkan device")).toEqual({ markFailed: true, runOnCpu: true });
  });
  it("records a failure per card and driver, replacing the earlier one", () => {
    let list = recordFailure([], rtx, { message: "device lost", at: 1 });
    list = recordFailure(list, rtx, { message: "device lost again", at: 2 });
    list = recordFailure(list, { ...rtx, driver: "2" }, { message: "device lost", at: 3 });
    expect(list).toEqual([
      { ...rtx, reason: "device lost again", at: 2 },
      { name: rtx.name, driver: "2", reason: "device lost", at: 3 },
    ]);
  });
  it("does not record an out-of-memory failure, and truncates long reasons", () => {
    expect(recordFailure([], rtx, { message: "out of memory", at: 1 })).toEqual([]);
    expect(recordFailure([], rtx, { message: "x".repeat(1000), at: 1 })[0]!.reason).toHaveLength(300);
  });
  it("forgets one card or every card", () => {
    const list: FailedDevice[] = [
      { ...rtx, reason: "", at: 1 },
      { name: "B", driver: "1", reason: "", at: 1 },
    ];
    expect(forgetFailure(list, rtx).map((f) => f.name)).toEqual(["B"]);
    expect(forgetFailure(list)).toEqual([]);
  });
  it("keeps the card only when it wins by a clear margin", () => {
    expect(pickFaster(700, 1000)).toBe("gpu");
    expect(pickFaster(900, 1000)).toBe("cpu");
    expect(pickFaster(800, 1000)).toBe("gpu");
  });
});

describe("hardware floor", () => {
  it("names the missing instructions instead of crashing", () => {
    const v = checkFloor({ platform: "win32", arch: "x64", avx2: false });
    expect(v).toEqual({
      ok: false,
      missing: ["a processor with AVX2 instructions"],
      message: "Speech recognition needs a processor with AVX2 instructions, which this computer does not have. Reading aloud and voice chat still work.",
    });
  });
  it("passes when AVX2 is present, unknown, or the CPU is not x86", () => {
    expect(checkFloor({ platform: "win32", arch: "x64", avx2: true })).toEqual({ ok: true });
    expect(checkFloor({ platform: "win32", arch: "x64" })).toEqual({ ok: true });
    expect(checkFloor({ platform: "darwin", arch: "arm64", avx2: false })).toEqual({ ok: true });
  });
  it("starts without a graphics driver", () => {
    expect(checkFloor({ platform: "win32", arch: "x64", avx2: true, gpu: undefined })).toEqual({ ok: true });
  });
  it("counts a discrete card and an Apple silicon Mac as fast graphics, an integrated card, no card or an Intel Mac as not", () => {
    expect(hasFastGraphics({ platform: "win32", arch: "x64", gpu: rtx })).toBe(true);
    expect(hasFastGraphics({ platform: "win32", arch: "x64", gpu: igpu })).toBe(false);
    expect(hasFastGraphics({ platform: "win32", arch: "x64" })).toBe(false);
    expect(hasFastGraphics({ platform: "darwin", arch: "arm64" })).toBe(true);
    expect(hasFastGraphics({ platform: "darwin", arch: "x64" })).toBe(false);
    expect(hasFastGraphics({ platform: "linux", arch: "arm64" })).toBe(false);
    expect(hasFastGraphics(undefined)).toBe(false);
  });

  it("names the model to use instead in the too-slow message", () => {
    expect(accurateModelFits({ platform: "win32", arch: "x64", cores: 2 }, "Whisper Base")).toEqual({ fits: false, reason: "This computer is too slow for the accurate model. Use Whisper Base." });
  });

  it("says the accurate model is too slow on a weak CPU without a discrete card", () => {
    expect(accurateModelFits({ platform: "win32", arch: "x64", cores: 2, memoryGb: 16 })).toEqual({ fits: false, reason: "This computer is too slow for the accurate model. Use the fast one." });
    expect(accurateModelFits({ platform: "win32", arch: "x64", cores: 8, memoryGb: 4 }).fits).toBe(false);
    expect(accurateModelFits({ platform: "win32", arch: "x64", cores: 8, memoryGb: 16 }).fits).toBe(true);
    expect(accurateModelFits({ platform: "win32", arch: "x64", cores: 2, memoryGb: 4, gpu: rtx }).fits).toBe(true);
    expect(accurateModelFits({ platform: "win32", arch: "x64", cores: 2, gpu: igpu }).fits).toBe(false);
    expect(accurateModelFits({ platform: "win32", arch: "x64" }).fits).toBe(true);
  });
  it("shows the device actually in use", () => {
    expect(deviceInUse(undefined, rtx)).toBe("Not loaded");
    expect(deviceInUse("gpu", rtx)).toBe("NVIDIA RTX 3060");
    expect(deviceInUse("gpu", undefined)).toBe("Graphics card");
    expect(deviceInUse("cpu", rtx)).toBe("CPU");
  });
});

/** Timers the test moves by hand. */
function clock() {
  let now = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let n = 0;
  const deps: IdleDeps = {
    now: () => now,
    setTimeout: (fn, ms) => (timers.set(++n, { at: now + ms, fn }), n),
    clearTimeout: (h) => void timers.delete(h as number),
  };
  const advance = async (ms: number) => {
    now += ms;
    const due = Array.from(timers.entries()).filter(([, t]) => t.at <= now);
    for (const [id, t] of due) {
      timers.delete(id);
      t.fn();
    }
    await Promise.resolve();
    await Promise.resolve();
  };
  return { deps, advance, pending: () => timers.size };
}

describe("IdleRelease", () => {
  const setup = (minutes: IdleMinutes, busy = () => false) => {
    const c = clock();
    const released: number[] = [];
    const idle = new IdleRelease({ minutes: () => minutes, busy, release: async () => void released.push(1), deps: c.deps });
    return { c, released, idle };
  };

  it("releases after the chosen number of minutes", async () => {
    const { c, released, idle } = setup(5);
    idle.touch();
    expect(idle.dueAt).toBe(300_000);
    await c.advance(299_999);
    expect(released).toEqual([]);
    await c.advance(1);
    expect(released).toEqual([1]);
    expect(idle.dueAt).toBeUndefined();
  });

  it("each use restarts the wait", async () => {
    const { c, released, idle } = setup(5);
    idle.touch();
    await c.advance(200_000);
    idle.touch();
    await c.advance(200_000);
    expect(released).toEqual([]);
    await c.advance(100_000);
    expect(released).toEqual([1]);
  });

  it("never releases when set to never, and schedules nothing", async () => {
    const { c, released, idle } = setup(0);
    idle.touch();
    expect(c.pending()).toBe(0);
    await c.advance(10 * 3_600_000);
    expect(released).toEqual([]);
  });

  it("never releases under a queued job: it waits the full time again", async () => {
    let busy = true;
    const { c, released, idle } = setup(15, () => busy);
    idle.touch();
    await c.advance(900_000);
    expect(released).toEqual([]);
    expect(idle.dueAt).toBe(1_800_000);
    busy = false;
    await c.advance(900_000);
    expect(released).toEqual([1]);
  });

  it("stop cancels the timer, and a failing release does not throw", async () => {
    const c = clock();
    const idle = new IdleRelease({ minutes: () => 5, busy: () => false, release: () => Promise.reject(new Error("gone")), deps: c.deps });
    idle.touch();
    idle.stop();
    expect(c.pending()).toBe(0);
    idle.touch();
    await c.advance(300_000);
    expect(idle.dueAt).toBeUndefined();
  });

  it("a changed setting applies at the next touch", async () => {
    let minutes: IdleMinutes = 60;
    const c = clock();
    const idle = new IdleRelease({ minutes: () => minutes, busy: () => false, release: async () => undefined, deps: c.deps });
    idle.touch();
    expect(idle.dueAt).toBe(3_600_000);
    minutes = 5;
    idle.touch();
    expect(idle.dueAt).toBe(300_000);
  });
});
