import { describe, expect, it } from "vite-plus/test";
import { Transfers, type TransferRun } from "../src";

const flush = () => new Promise((r) => setTimeout(r, 0));

/** A run that finishes when `finish()` is called and stops (rejecting with the signal's reason) when aborted. */
function controlled() {
  let finish!: () => void;
  const runs: TransferRun[] = [];
  const run = (r: TransferRun) =>
    new Promise<void>((resolve, reject) => {
      runs.push(r);
      finish = resolve;
      r.signal.addEventListener("abort", () => reject(r.signal.reason), { once: true });
    });
  return { run, runs, finish: () => finish() };
}

describe("Transfers", () => {
  it("joins a second request for the same model instead of starting another transfer", async () => {
    const t = new Transfers();
    const c = controlled();
    const a = t.start("m", c.run);
    const b = t.start("m", () => Promise.reject(new Error("must not start")));
    expect(a).toBe(b);
    expect(c.runs).toHaveLength(1);
    c.finish();
    await a;
    expect(t.list()).toEqual([]);
  });

  it("runs different models side by side", async () => {
    const t = new Transfers();
    const one = controlled();
    const two = controlled();
    void t.start("a", one.run);
    void t.start("b", two.run);
    expect(t.list().map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("reports progress and a time left once there is a measurement", async () => {
    let now = 0;
    const t = new Transfers(() => now);
    const c = controlled();
    void t.start("m", c.run);
    now = 10_000;
    c.runs[0]!.progress(0.5);
    expect(t.get("m")).toEqual({ id: "m", state: "running", fraction: 0.5, etaSeconds: 10 });
  });

  it("gives no time left before one second or one percent has passed", () => {
    const t = new Transfers(() => 0);
    const c = controlled();
    void t.start("m", c.run);
    c.runs[0]!.progress(0.5);
    expect(t.get("m")?.etaSeconds).toBeUndefined();
  });

  it("pause keeps the transfer and the waiting caller; resume runs again and the same promise settles", async () => {
    const t = new Transfers();
    const c = controlled();
    const p = t.start("m", c.run);
    c.runs[0]!.progress(0.4);
    t.pause("m");
    await flush();
    expect(t.get("m")).toEqual({ id: "m", state: "paused", fraction: 0.4 });
    t.resume("m");
    expect(t.get("m")?.state).toBe("running");
    expect(c.runs).toHaveLength(2);
    expect(c.runs[1]!.signal.aborted).toBe(false);
    c.finish();
    await p;
    expect(t.list()).toEqual([]);
  });

  it("cancel rejects the caller and drops the transfer, also when it is paused", async () => {
    const t = new Transfers();
    const c = controlled();
    const p = t.start("m", c.run);
    t.cancel("m");
    await expect(p).rejects.toThrow("download cancelled");
    expect(t.list()).toEqual([]);

    const d = controlled();
    const q = t.start("n", d.run);
    t.pause("n");
    await flush();
    t.cancel("n");
    await expect(q).rejects.toThrow("download cancelled");
    expect(t.list()).toEqual([]);
  });

  it("a real failure rejects every joined caller and frees the id for a new try", async () => {
    const t = new Transfers();
    const p = t.start("m", () => Promise.reject(new Error("host down")));
    const q = t.start("m", () => Promise.resolve());
    await expect(p).rejects.toThrow("host down");
    await expect(q).rejects.toThrow("host down");
    await t.start("m", () => Promise.resolve());
  });

  it("ignores pause, resume and cancel for models it does not know, and a repeated pause or resume", async () => {
    const t = new Transfers();
    t.pause("x");
    t.resume("x");
    t.cancel("x");
    const c = controlled();
    void t.start("m", c.run);
    t.resume("m"); // not paused: nothing happens
    expect(c.runs).toHaveLength(1);
    t.pause("m");
    t.pause("m");
    await flush();
    expect(t.get("m")?.state).toBe("paused");
  });

  it("tells listeners about every change and stops after unsubscribe", async () => {
    const t = new Transfers();
    const seen: number[] = [];
    const off = t.onChange((l) => seen.push(l.length));
    const c = controlled();
    const p = t.start("m", c.run);
    c.finish();
    await p;
    expect(seen).toEqual([1, 0]);
    off();
    await t.start("n", () => Promise.resolve());
    expect(seen).toEqual([1, 0]);
  });
});
