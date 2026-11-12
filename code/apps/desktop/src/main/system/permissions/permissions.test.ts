import { describe, expect, it } from "vite-plus/test";
import type { PermissionId, PermissionState } from "../../../shared/permissions/channels";
import type { PermissionsStatus } from "../../../shared/permissions/contract";
import { guideFor } from "../../../shared/permissions/guide";
import { macAdapter, noPermissionsAdapter, windowsAdapter, type Prefs } from "./adapters";
import { createPermissions, type PermissionsAdapter } from "./service";

const all = (s: PermissionState): Record<PermissionId, PermissionState> => ({ accessibility: s, "input-monitoring": s, microphone: s, "screen-recording": s });

function fakePrefs(over: Partial<{ trusted: boolean; mic: string; screen: string; askMic: boolean }> = {}) {
  const log: string[] = [];
  const s = { trusted: false, mic: "not-determined", screen: "denied", askMic: true, ...over };
  const prefs: Prefs = {
    isTrustedAccessibilityClient(prompt) {
      log.push(`trusted(${prompt})`);
      return s.trusted;
    },
    getMediaAccessStatus: (k) => (k === "microphone" ? s.mic : s.screen),
    askForMediaAccess: async () => (log.push("askMic"), s.askMic),
  };
  return { prefs, log, s };
}

describe("macOS permissions adapter", () => {
  it("reads each permission from its own source", async () => {
    const { prefs, s } = fakePrefs({ mic: "granted", screen: "restricted" });
    let input: "granted" | "denied" | "unknown" = "denied";
    const a = macAdapter(prefs, async () => ({ status: () => input, request: () => true }));
    expect(await a.read("microphone")).toBe("granted");
    expect(await a.read("screen-recording")).toBe("restricted");
    expect(await a.read("input-monitoring")).toBe("denied");
    input = "unknown";
    expect(await a.read("input-monitoring")).toBe("not-determined");
    expect(await a.read("accessibility")).toBe("not-determined");
    s.trusted = true;
    expect(await a.read("accessibility")).toBe("granted");
  });

  it("maps a status Electron adds later to unknown, never to granted", async () => {
    const { prefs } = fakePrefs({ mic: "something-new" });
    expect(await macAdapter(prefs, async () => ({ status: () => "granted", request: () => true })).read("microphone")).toBe("unknown");
  });

  it("shows the system prompt where there is one and none for Screen Recording", async () => {
    const { prefs, log } = fakePrefs();
    let requested = 0;
    const a = macAdapter(prefs, async () => ({ status: () => "unknown", request: () => (requested++, true) }));
    expect(await a.prompt("accessibility")).toBe(true);
    expect(await a.prompt("microphone")).toBe(true);
    expect(await a.prompt("input-monitoring")).toBe(true);
    expect(await a.prompt("screen-recording")).toBe(false);
    expect(log).toEqual(["trusted(true)", "askMic"]);
    expect(requested).toBe(1);
  });

  it("opens the Privacy pane of each permission", () => {
    const a = macAdapter(fakePrefs().prefs, async () => ({ status: () => "granted", request: () => true }));
    expect(["accessibility", "input-monitoring", "microphone", "screen-recording"].map((id) => a.settingsUrl(id as PermissionId))).toEqual([
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    ]);
  });
});

describe("Windows and other platforms", () => {
  it("has a microphone switch and nothing else", async () => {
    const a = windowsAdapter(fakePrefs({ mic: "denied" }).prefs);
    expect(await a.read("microphone")).toBe("denied");
    expect(await a.read("accessibility")).toBe("not-needed");
    expect(await a.read("screen-recording")).toBe("not-needed");
    expect(await a.prompt("microphone")).toBe(false);
    expect(a.settingsUrl("microphone")).toBe("ms-settings:privacy-microphone");
    expect(a.settingsUrl("accessibility")).toBeNull();
  });

  it("needs nothing on a system without these permissions", async () => {
    expect(await noPermissionsAdapter.read("microphone")).toBe("not-needed");
    expect(noPermissionsAdapter.settingsUrl("microphone")).toBeNull();
  });
});

function service(states: Partial<Record<PermissionId, PermissionState>>, prompts: PermissionId[] = []) {
  const current = { ...all("granted"), ...states };
  const opened: string[] = [];
  const changes: PermissionsStatus[] = [];
  const adapter: PermissionsAdapter = {
    platform: "darwin",
    read: async (id) => {
      if (current[id] === ("throw" as never)) throw new Error("no");
      return current[id];
    },
    prompt: async (id) => prompts.includes(id),
    settingsUrl: (id) => (id === "screen-recording" ? null : `settings:${id}`),
  };
  const p = createPermissions({ adapter, openUrl: async (u) => void opened.push(u), onChange: (s) => void changes.push(s) });
  return { p, current, opened, changes };
}

describe("permissions service", () => {
  it("reports the status with a first-use guide and tells listeners only about changes", async () => {
    const t = service({ microphone: "not-determined" });
    const first = await t.p.status();
    expect(first.states.microphone).toBe("not-determined");
    expect(first.guides.dictation.next).toEqual({ id: "microphone", state: "not-determined", action: "request" });
    await t.p.status();
    expect(t.changes).toHaveLength(1);
    t.current.microphone = "granted";
    await t.p.status();
    expect(t.changes).toHaveLength(2);
    expect(t.changes[1]?.guides.dictation.next).toBeNull();
  });

  it("reads a permission the system cannot answer as unknown", async () => {
    const t = service({ accessibility: "throw" as never });
    expect((await t.p.status()).states.accessibility).toBe("unknown");
  });

  it("shows the prompt for a permission not asked yet and does not open settings", async () => {
    const t = service({ microphone: "not-determined" }, ["microphone"]);
    await t.p.request("microphone");
    expect(t.opened).toEqual([]);
  });

  it("opens the settings pane when the prompt was refused before or does not exist", async () => {
    const t = service({ microphone: "denied", accessibility: "not-determined" }, ["accessibility"]);
    await t.p.request("microphone");
    expect(t.opened).toEqual(["settings:microphone"]);
    t.current.accessibility = "not-determined";
    const noPrompt = service({ accessibility: "not-determined" });
    await noPrompt.p.request("accessibility");
    expect(noPrompt.opened).toEqual(["settings:accessibility"]);
  });

  it("does nothing for a permission that is granted or not needed", async () => {
    const t = service({ microphone: "granted", accessibility: "not-needed" });
    await t.p.request("microphone");
    await t.p.request("accessibility");
    expect(t.opened).toEqual([]);
  });

  it("returns false when there is no pane or opening it fails", async () => {
    const t = service({});
    expect(await t.p.openSettings("screen-recording")).toBe(false);
    const failing = createPermissions({
      adapter: { platform: "darwin", read: async () => "denied", prompt: async () => false, settingsUrl: () => "x" },
      openUrl: async () => {
        throw new Error("no handler");
      },
    });
    expect(await failing.openSettings("microphone")).toBe(false);
    expect(await t.p.openSettings("microphone")).toBe(true);
  });

  it("works without a change listener", async () => {
    const p = createPermissions({ adapter: noPermissionsAdapter, openUrl: async () => {} });
    expect((await p.status()).platform).toBe("other");
  });
});

describe("first-use guide", () => {
  it("lists dictation's steps in the order the system should be asked and points at the first open one", () => {
    const g = guideFor({ ...all("granted"), microphone: "granted", "input-monitoring": "denied", accessibility: "not-determined" }, "dictation");
    expect(g.steps.map((s) => [s.id, s.action])).toEqual([
      ["microphone", "none"],
      ["input-monitoring", "open-settings"],
      ["accessibility", "request"],
    ]);
    expect(g.next?.id).toBe("input-monitoring");
  });

  it("is finished when everything is granted or not needed here", () => {
    expect(guideFor({ ...all("not-needed"), microphone: "granted" }, "dictation").next).toBeNull();
  });

  it("never treats an unknown or restricted state as granted", () => {
    expect(guideFor(all("unknown"), "dictation").next?.id).toBe("microphone");
    expect(guideFor(all("restricted"), "dictation").next?.action).toBe("open-settings");
  });

  it("sends Screen Recording to settings even before it was asked", () => {
    expect(guideFor(all("not-determined"), "screen-reading").next).toEqual({ id: "screen-recording", state: "not-determined", action: "open-settings" });
  });
});
