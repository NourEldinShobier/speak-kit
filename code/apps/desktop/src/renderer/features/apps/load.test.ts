import { describe, expect, it } from "vite-plus/test";
import { loadInstalledApps } from "./load";

describe("loadInstalledApps", () => {
  it("asks for a fresh scan and returns the apps", async () => {
    const asked: boolean[] = [];
    const found = await loadInstalledApps(async (refresh) => (asked.push(refresh), { apps: [{ key: "slack", name: "Slack" }], available: true }));
    expect(asked).toEqual([true]);
    expect(found).toEqual({ status: "ready", apps: [{ key: "slack", name: "Slack" }] });
  });
  it("is unavailable when the system cannot list programs or the ask fails", async () => {
    expect(await loadInstalledApps(async () => ({ apps: [], available: false }))).toEqual({ status: "unavailable" });
    expect(await loadInstalledApps(() => Promise.reject(new Error("ipc")))).toEqual({ status: "unavailable" });
  });
});
