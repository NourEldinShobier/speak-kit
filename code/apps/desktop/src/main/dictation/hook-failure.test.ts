import { describe, expect, it } from "vite-plus/test";
import { createHookFailure } from "./hook-failure";

function rig(enabled = true) {
  const log: string[] = [];
  const state = { enabled };
  const hook = createHookFailure({
    ready: async () => undefined,
    enabled: () => state.enabled,
    alert: () => log.push("alert"),
    changed: () => log.push("changed"),
    warn: (t, d) => log.push(`warn:${t}:${d}`),
    restart: async () => void log.push("restart"),
  });
  return { hook, log, state };
}

describe("hook failure", () => {
  it("is not failed at first", () => {
    expect(rig().hook.failed).toBe(false);
  });

  it("shows the failure and tells the page when set, and only tells the page when cleared", () => {
    const r = rig();
    r.hook.set(true);
    expect([r.hook.failed, r.log]).toEqual([true, ["alert", "changed"]]);
    r.log.length = 0;
    r.hook.set(false);
    expect([r.hook.failed, r.log]).toEqual([false, ["changed"]]);
  });

  it("marks the flag without a word", () => {
    const r = rig();
    r.hook.mark(true);
    expect([r.hook.failed, r.log]).toEqual([true, []]);
  });

  it("logs a fault and fails when it could not be reinstalled", () => {
    const r = rig();
    r.hook.onFault(new Error("boom"), false);
    expect(r.log).toEqual(["warn:dictation hook failed:Error: boom (not reinstalled)", "alert", "changed"]);
    expect(r.hook.failed).toBe(true);
  });

  it("logs a fault that was reinstalled and stays running", () => {
    const r = rig();
    r.hook.onFault("x", true);
    expect(r.log).toEqual(["warn:dictation hook failed:x (reinstalled)", "changed"]);
    expect(r.hook.failed).toBe(false);
  });

  it("reports nothing for a fault after dictation was switched off", () => {
    const r = rig(false);
    r.hook.onFault("x", false);
    expect(r.log).toEqual(["warn:dictation hook failed:x (not reinstalled)"]);
    expect(r.hook.failed).toBe(false);
  });

  it("starts again only when it failed, dictation is on and the permission was just given", async () => {
    const r = rig();
    await r.hook.retry(true);
    expect(r.log).toEqual([]);
    r.hook.mark(true);
    await r.hook.retry(false);
    expect(r.log).toEqual([]);
    await r.hook.retry(true);
    expect(r.log).toEqual(["restart"]);
    r.state.enabled = false;
    await r.hook.retry(true);
    expect(r.log).toEqual(["restart"]);
  });
});
