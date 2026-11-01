import { EventEmitter } from "node:events";
import { describe, expect, it } from "vite-plus/test";
import type { UpdateState } from "../shared/updates";
import { Updates, type UpdaterLike } from "./updates";

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  calls: string[] = [];
  checkForUpdates = async () => void this.calls.push("check");
  downloadUpdate = async () => void this.calls.push("download");
  quitAndInstall = (silent?: boolean, run?: boolean) => void this.calls.push(`install ${silent} ${run}`);
}

function setup(supported = true) {
  const u = new FakeUpdater();
  const states: UpdateState[] = [];
  const ready: string[] = [];
  let quit = 0;
  const up = new Updates({
    supported,
    load: async () => u,
    onState: (s) => states.push(s),
    onReady: (v) => ready.push(v),
    now: () => 42,
    beforeInstall: () => quit++,
  });
  return { u, up, states, ready, quits: () => quit };
}

describe("Updates", () => {
  it("is unsupported in a build that cannot update, and never loads the updater", async () => {
    const t = setup(false);
    expect(t.up.state).toEqual({ kind: "unsupported" });
    await t.up.check();
    expect(t.u.calls).toEqual([]);
  });

  it("never downloads or installs by itself: the updater is configured manual", async () => {
    const t = setup();
    await t.up.check();
    expect(t.u.autoDownload).toBe(false);
    expect(t.u.autoInstallOnAppQuit).toBe(false);
    expect(t.states).toEqual([{ kind: "checking" }]);
  });

  it("walks checking, available, downloading, ready", async () => {
    const t = setup();
    await t.up.check();
    t.u.emit("update-available", { version: "0.2.0" });
    expect(t.up.state).toEqual({ kind: "available", version: "0.2.0" });
    await t.up.download();
    t.u.emit("download-progress", { percent: 41.6 });
    expect(t.up.state).toEqual({ kind: "downloading", version: "0.2.0", percent: 42 });
    t.u.emit("update-downloaded", { version: "0.2.0" });
    expect(t.up.state).toEqual({ kind: "ready", version: "0.2.0", onQuit: false });
    expect(t.ready).toEqual(["0.2.0"]);
    expect(t.u.calls).toEqual(["check", "download"]);
  });

  it("no update returns to idle with the check time", async () => {
    const t = setup();
    await t.up.check();
    t.u.emit("update-not-available");
    expect(t.up.state).toEqual({ kind: "idle", checkedAtMs: 42 });
  });

  it("an updater error is shown, and the next check can run again", async () => {
    const t = setup();
    await t.up.check();
    t.u.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED"));
    expect(t.up.state).toEqual({ kind: "error", message: "net::ERR_INTERNET_DISCONNECTED" });
    await t.up.check();
    expect(t.u.calls).toEqual(["check", "check"]);
  });

  it("Install when I quit only arms the installer; Restart now quits and reopens", async () => {
    const t = setup();
    await t.up.check();
    t.u.emit("update-available", { version: "0.2.0" });
    await t.up.installNow(); // not downloaded yet: ignored
    expect(t.u.calls).toEqual(["check"]);
    t.u.emit("update-downloaded", { version: "0.2.0" });
    await t.up.installOnQuit();
    expect(t.u.autoInstallOnAppQuit).toBe(true);
    expect(t.up.state).toEqual({ kind: "ready", version: "0.2.0", onQuit: true });
    await t.up.installNow();
    expect(t.up.state).toEqual({ kind: "restarting", version: "0.2.0" });
    expect(t.quits()).toBe(1);
    expect(t.u.calls.at(-1)).toBe("install false true");
  });

  it("checkAndDownload fetches in the background when there is an update", async () => {
    const t = setup();
    const p = t.up.checkAndDownload();
    await Promise.resolve();
    await p;
    expect(t.u.calls).toEqual(["check"]);
    t.u.emit("update-available", { version: "0.3.0" });
    await t.up.download();
    expect(t.u.calls).toEqual(["check", "download"]);
  });
});
