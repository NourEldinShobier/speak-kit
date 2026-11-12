import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import type { UpdateState } from "../shared/updates";
import { RELEASES, RELEASES_PAGE, Updates, feedOverride, githubLatestRelease, isReleaseUrl, updateMode, type UpdateEnv, type UpdateMode, type UpdaterLike } from "./updates";

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = false;
  calls: string[] = [];
  checkForUpdates = async () => void this.calls.push("check");
  downloadUpdate = async () => void this.calls.push("download");
  quitAndInstall = (silent?: boolean, run?: boolean) => void this.calls.push(`install ${silent} ${run}`);
  addQuitHandler = () => void this.calls.push("quit-handler");
}

function setup(mode: UpdateMode = "auto", o: { latest?: (early: boolean) => Promise<{ version: string; url: string }>; busy?: boolean; early?: () => boolean } = {}) {
  const u = new FakeUpdater();
  const states: UpdateState[] = [];
  const ready: string[] = [];
  let quit = 0;
  let asked = 0;
  const up = new Updates({
    mode,
    currentVersion: "0.3.1",
    load: async () => u,
    ...(o.latest ? { latestRelease: o.latest } : {}),
    ...(o.early ? { early: o.early } : {}),
    onState: (s) => states.push(s),
    onReady: (v) => ready.push(v),
    now: () => 42,
    busy: () => o.busy ?? false,
    onBusy: () => void asked++,
    beforeInstall: () => quit++,
  });
  return { u, up, states, ready, quits: () => quit, asked: () => asked };
}

describe("Updates", () => {
  it("is unsupported in a build that cannot update, and never loads the updater", async () => {
    const t = setup("unsupported");
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

  it("a check that rejects without an error event still ends in the error state", async () => {
    const t = setup();
    t.u.checkForUpdates = async () => {
      throw new Error("net::ERR_INTERNET_DISCONNECTED");
    };
    await t.up.check();
    expect(t.up.state).toEqual({ kind: "error", error: { code: "update-offline" }, phase: "check" });
  });

  it("an updater error is shown, and the next check can run again", async () => {
    const t = setup();
    await t.up.check();
    t.u.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED"));
    expect(t.up.state).toEqual({ kind: "error", error: { code: "update-offline" }, phase: "check" });
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
    // electron-updater only hooks the app's quit event while downloading and only if the flag was already true then
    expect(t.u.calls.at(-1)).toBe("quit-handler");
    expect(t.up.state).toEqual({ kind: "ready", version: "0.2.0", onQuit: true });
    await t.up.installNow();
    expect(t.up.state).toEqual({ kind: "restarting", version: "0.2.0" });
    expect(t.quits()).toBe(1);
    expect(t.u.calls.at(-1)).toBe("install true true");
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

describe("failure paths", () => {
  const failing = async (message: string, phase: "check" | "download") => {
    const t = setup();
    await t.up.check();
    if (phase === "download") {
      t.u.emit("update-available", { version: "0.3.2" });
      await t.up.download();
    }
    t.u.emit("error", new Error(message));
    return t;
  };

  it("offline during a check is an offline error and the next check runs", async () => {
    const t = await failing("net::ERR_INTERNET_DISCONNECTED", "check");
    expect(t.up.state).toMatchObject({ kind: "error", error: { code: "update-offline" }, phase: "check" });
    await t.up.check();
    expect(t.up.state).toEqual({ kind: "checking" });
  });

  it("a 404 for latest.yml is reported as not found", async () => {
    const t = await failing("Cannot find latest.yml in the latest release artifacts (https://x/latest.yml): HttpError: 404", "check");
    expect(t.up.state).toMatchObject({ kind: "error", error: { code: "update-not-found" }, phase: "check" });
  });

  it("a checksum mismatch during the download is reported, and nothing becomes ready", async () => {
    const t = await failing("sha512 checksum mismatch, expected abc, got def", "download");
    expect(t.up.state).toMatchObject({ kind: "error", error: { code: "update-checksum" }, phase: "download" });
    expect(t.ready).toEqual([]);
  });

  it("an interrupted download can be run again: the retry fetches and ends ready", async () => {
    const t = await failing("read ECONNRESET", "download");
    expect(t.up.state).toMatchObject({ kind: "error", error: { code: "update-interrupted" }, phase: "download" });
    await t.up.check();
    t.u.emit("update-available", { version: "0.3.2" });
    await t.up.download();
    t.u.emit("download-progress", { percent: 100 });
    t.u.emit("update-downloaded", { version: "0.3.2" });
    expect(t.up.state).toEqual({ kind: "ready", version: "0.3.2", onQuit: false });
    expect(t.u.calls).toEqual(["check", "download", "check", "download"]);
  });

  it("a restart is held while a reading or export runs, and goes ahead once confirmed", async () => {
    const t = setup("auto", { busy: true });
    await t.up.check();
    t.u.emit("update-available", { version: "0.3.2" });
    t.u.emit("update-downloaded", { version: "0.3.2" });
    await t.up.installNow();
    expect(t.up.state).toEqual({ kind: "ready", version: "0.3.2", onQuit: false });
    expect(t.asked()).toBe(1);
    expect(t.quits()).toBe(0);
    expect(t.u.calls).toEqual(["check"]);
    await t.up.installNow(true);
    expect(t.up.state).toEqual({ kind: "restarting", version: "0.3.2" });
    expect(t.quits()).toBe(1);
  });

  it("Install when I quit does not need a confirmation while busy", async () => {
    const t = setup("auto", { busy: true });
    await t.up.check();
    t.u.emit("update-downloaded", { version: "0.3.2" });
    await t.up.installOnQuit();
    expect(t.up.state).toEqual({ kind: "ready", version: "0.3.2", onQuit: true });
    expect(t.asked()).toBe(0);
  });
});

describe("manual mode (macOS)", () => {
  it("never loads electron-updater; a newer release becomes the manual state", async () => {
    const t = setup("manual", { latest: async () => ({ version: "0.4.0", url: `${RELEASES_PAGE}tag/v0.4.0` }) });
    await t.up.checkAndDownload();
    expect(t.states).toEqual([{ kind: "checking" }, { kind: "manual", version: "0.4.0", url: `${RELEASES_PAGE}tag/v0.4.0` }]);
    expect(t.u.calls).toEqual([]);
    await t.up.installNow();
    expect(t.quits()).toBe(0);
  });

  it("the same or an older release is up to date", async () => {
    const t = setup("manual", { latest: async () => ({ version: "0.3.1", url: RELEASES_PAGE }) });
    await t.up.check();
    expect(t.up.state).toEqual({ kind: "idle", checkedAtMs: 42 });
  });

  it("a failed lookup is an error that names its code", async () => {
    const t = setup("manual", { latest: () => Promise.reject(new Error("GitHub answered 404 for the latest release")) });
    await t.up.check();
    expect(t.up.state).toMatchObject({ kind: "error", error: { code: "update-not-found" }, phase: "check" });
  });
});

describe("update channel", () => {
  it("the early channel lets the updater take pre-releases, read again at every check", async () => {
    let early = false;
    const t = setup("auto", { early: () => early });
    await t.up.check();
    expect(t.u.allowPrerelease).toBe(false);
    t.u.emit("update-not-available", {});
    early = true;
    await t.up.check();
    expect(t.u.allowPrerelease).toBe(true);
  });

  it("the manual flow asks for the early release only on the early channel", async () => {
    const asked: boolean[] = [];
    const t = setup("manual", { early: () => true, latest: async (e) => (asked.push(e), { version: "0.9.0-beta.1", url: `${RELEASES_PAGE}tag/v0.9.0-beta.1` }) });
    await t.up.check();
    expect(asked).toEqual([true]);
    expect(t.up.state).toMatchObject({ kind: "manual", version: "0.9.0-beta.1" });
  });
});

describe("githubLatestRelease early", () => {
  const list = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  it("takes the newest release that is not a draft, pre-releases included", async () => {
    const r = await githubLatestRelease(
      list([
        { tag_name: "v1.0.0-draft", html_url: `${RELEASES_PAGE}tag/x`, draft: true },
        { tag_name: "v0.9.0-beta.2", html_url: `${RELEASES_PAGE}tag/v0.9.0-beta.2` },
      ]),
      true,
    );
    expect(r.version).toBe("0.9.0-beta.2");
  });
  it("rejects an empty list and a foreign page", async () => {
    await expect(githubLatestRelease(list([]), true)).rejects.toThrow("unexpected");
    await expect(githubLatestRelease(list([{ tag_name: "v1", html_url: "https://evil.example/" }]), true)).rejects.toThrow("unexpected");
  });
});

describe("githubLatestRelease", () => {
  const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("reads the version from the tag and keeps the release page", async () => {
    const r = await githubLatestRelease(answer(200, { tag_name: "v0.4.0", html_url: `${RELEASES_PAGE}tag/v0.4.0` }));
    expect(r).toEqual({ version: "0.4.0", url: `${RELEASES_PAGE}tag/v0.4.0` });
  });

  it("rejects an error status and a release page outside this project", async () => {
    await expect(githubLatestRelease(answer(404, { message: "Not Found" }))).rejects.toThrow("404");
    await expect(githubLatestRelease(answer(200, { tag_name: "v9.9.9", html_url: "https://evil.example/releases/" }))).rejects.toThrow("unexpected");
    await expect(githubLatestRelease(answer(200, { nope: 1 }))).rejects.toThrow("unexpected");
  });

  it("only this project's releases may be opened", () => {
    expect(isReleaseUrl(`${RELEASES_PAGE}tag/v1.0.0`)).toBe(true);
    expect(isReleaseUrl("https://github.com/someone/else/releases/tag/v1")).toBe(false);
  });

  it("matches the publish target in electron-builder.yml", () => {
    const yml = readFileSync(new URL("../../electron-builder.yml", import.meta.url), "utf8");
    expect(yml).toContain(`owner: ${RELEASES.owner}`);
    expect(yml).toContain(`repo: ${RELEASES.repo}`);
  });
});

describe("updateMode and feedOverride", () => {
  const base: UpdateEnv = { platform: "win32", packaged: true, portable: false, isolated: false, feedUrl: undefined, fake: false, forceManual: false };
  const mode = (o: Partial<UpdateEnv>) => updateMode({ ...base, ...o });

  it("an installed Windows build updates itself", () => expect(mode({})).toBe("auto"));
  it("the portable build is unsupported", () => expect(mode({ portable: true })).toBe("unsupported"));
  it("a source checkout is unsupported", () => expect(mode({ packaged: false })).toBe("unsupported"));
  it("macOS only announces releases", () => expect(mode({ platform: "darwin" })).toBe("manual"));
  it("a test flag forces the manual flow on any build", () => expect(mode({ packaged: false, forceManual: true })).toBe("manual"));
  it("a fake updater makes a source checkout updatable", () => expect(mode({ packaged: false, fake: true })).toBe("auto"));
  it("a smoke run with an isolated data folder stays off GitHub, unless a feed URL is given", () => {
    expect(mode({ isolated: true })).toBe("unsupported");
    expect(mode({ isolated: true, feedUrl: "http://127.0.0.1:1/" })).toBe("auto");
  });
  it("other platforms are unsupported", () => expect(mode({ platform: "linux" })).toBe("unsupported"));

  it("feedOverride accepts only http(s) addresses", () => {
    expect(feedOverride("http://127.0.0.1:8080/updates")).toBe("http://127.0.0.1:8080/updates");
    expect(feedOverride("file:///c:/x")).toBeUndefined();
    expect(feedOverride("not a url")).toBeUndefined();
    expect(feedOverride(undefined)).toBeUndefined();
  });
});
