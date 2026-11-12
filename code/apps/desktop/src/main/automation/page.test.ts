import { describe, expect, it } from "vite-plus/test";
import type { CliInstall, Launcher } from "@speakkit/cli";
import type { AutomationLimits } from "@speakkit/protocol";
import { createAutomationPage, type PageDeps } from "./page";

const LIMITS: AutomationLimits = { maxStreams: 2, maxWaiting: 8, maxTextChars: 100_000, maxQueued: 20, maxSubscribers: 4, heartbeatMs: 15_000, controlDeadlineMs: 8000, streamIdleMs: 30_000 };

/** A launcher that moves through the states the real one does. */
function fakeLauncher(start: CliInstall["state"] = "not-installed") {
  let state = start;
  const calls: string[] = [];
  const view = (changed = false): CliInstall => ({
    state,
    dir: "C:\\bin",
    file: "C:\\bin\\speakkit.cmd",
    onPath: state === "installed",
    needsNewTerminal: changed,
    ...(state === "broken" && { problem: "speakkit.cmd is missing." }),
  });
  const l: Launcher & { fail?: Error } = {
    inspect: async () => view(),
    install: async () => {
      calls.push("install");
      if (l.fail) throw l.fail;
      state = "installed";
      return view(true);
    },
    remove: async () => {
      calls.push("remove");
      state = "not-installed";
      return view(true);
    },
  };
  return { l, calls };
}

function setup(over: Partial<PageDeps> = {}, launcherState: CliInstall["state"] = "not-installed") {
  const files: Record<string, string> = {};
  const terminals: [string, string][] = [];
  const launcher = fakeLauncher(launcherState);
  const page = createAutomationPage({
    platform: "win32",
    version: "1.2.3",
    execPath: "C:\\App\\Speak Kit.exe",
    script: "C:\\App\\cli.js",
    home: "C:\\Users\\me",
    launcher: launcher.l,
    skillFs: { read: async (f) => files[f.replace(/\\/g, "/")] ?? null, write: async (f, t) => void (files[f.replace(/\\/g, "/")] = t) },
    limits: async () => LIMITS,
    openTerminal: async (c, d) => void terminals.push([c, d]),
    ...over,
  });
  return { page, files, terminals, launcher };
}

describe("info", () => {
  it("describes a clean computer: nothing installed, the limits of the running server, a PATH-less MCP entry", async () => {
    const { page } = setup();
    const i = await page.handlers.automationInfo();
    expect(i).toMatchObject({ cli: { state: "not-installed", onPath: false, needsNewTerminal: false }, skill: { state: "none" }, appVersion: "1.2.3", limits: LIMITS });
    expect(JSON.parse(i.mcpConfig).mcpServers.speakkit).toEqual({ command: "C:\\App\\Speak Kit.exe", args: ["C:\\App\\cli.js", "mcp"], env: { ELECTRON_RUN_AS_NODE: "1" } });
  });
  it("uses the short MCP entry once speakkit is on the PATH", async () => {
    const { page } = setup({}, "installed");
    expect(JSON.parse((await page.handlers.automationInfo()).mcpConfig).mcpServers.speakkit).toEqual({ command: "speakkit", args: ["mcp"] });
  });
  it("limits are null when the server is not running, also when asking for them fails", async () => {
    expect((await setup({ limits: async () => null }).page.handlers.automationInfo()).limits).toBeNull();
    const failing = setup({
      limits: async () => {
        throw new Error("connection refused");
      },
    });
    expect((await failing.page.handlers.automationInfo()).limits).toBeNull();
  });
  it("has no cli entry where this OS has no launcher", async () => {
    expect((await setup({ launcher: null }).page.handlers.automationInfo()).cli).toBeNull();
  });
  it("carries the problem of a broken launcher", async () => {
    expect((await setup({}, "broken").page.handlers.automationInfo()).cli).toMatchObject({ state: "broken", problem: "speakkit.cmd is missing." });
  });
});

describe("command line actions", () => {
  it("install puts the tool on the PATH and says a new terminal is needed", async () => {
    const t = setup();
    expect((await t.page.handlers.automationCli("install")).cli).toMatchObject({ state: "installed", onPath: true, needsNewTerminal: true });
    expect(t.launcher.calls).toEqual(["install"]);
  });
  it("remove takes it off again", async () => {
    const t = setup({}, "installed");
    expect((await t.page.handlers.automationCli("remove")).cli).toMatchObject({ state: "not-installed", needsNewTerminal: true });
  });
  it("repair is install on a broken launcher", async () => {
    const t = setup({}, "broken");
    expect((await t.page.handlers.automationCli("install")).cli).toMatchObject({ state: "installed" });
  });
  it("a failure comes back as an error the page can show, with the cause", async () => {
    const t = setup();
    t.launcher.l.fail = new Error("EACCES: permission denied");
    await expect(t.page.handlers.automationCli("install")).rejects.toMatchObject({ error: { code: "unexpected", args: { detail: "EACCES: permission denied" } } });
  });
  it("test opens a terminal in the launcher's folder on Windows", async () => {
    const t = setup({}, "installed");
    await t.page.handlers.automationCli("test");
    expect(t.terminals).toEqual([["speakkit capabilities", "C:\\bin"]]);
    expect(t.launcher.calls).toEqual([]);
  });
  it("test runs the launcher by full path on macOS, where the app's PATH is stale", async () => {
    const t = setup({ platform: "darwin" }, "installed");
    await t.page.handlers.automationCli("test");
    expect(t.terminals).toEqual([['"C:\\bin\\speakkit.cmd" capabilities', "C:\\bin"]]);
  });
  it("test does not claim a new terminal is needed", async () => {
    expect((await setup({}, "installed").page.handlers.automationCli("test")).cli?.needsNewTerminal).toBe(false);
  });
  it("a terminal that cannot be opened is an error", async () => {
    const t = setup(
      {
        openTerminal: async () => {
          throw new Error("spawn cmd.exe ENOENT");
        },
      },
      "installed",
    );
    await expect(t.page.handlers.automationCli("test")).rejects.toMatchObject({ error: { code: "unexpected" } });
  });
  it("every action is refused without a launcher", async () => {
    await expect(setup({ launcher: null }).page.handlers.automationCli("install")).rejects.toMatchObject({ error: { code: "unexpected" } });
  });
});

describe("agent skill", () => {
  it("install writes the skill for this version under the user's skills folder", async () => {
    const t = setup();
    const i = await t.page.handlers.automationSkill();
    expect(i.skill).toMatchObject({ state: "current" });
    expect(Object.keys(t.files)).toHaveLength(1);
    expect(Object.values(t.files)[0]).toContain("<!-- speakkit-version: 1.2.3 -->");
  });
  it("a skill of an older app shows as out of date and updating makes it current", async () => {
    const t = setup();
    await t.page.handlers.automationSkill();
    const next = setup({ version: "1.3.0", skillFs: { read: async (f) => t.files[f.replace(/\\/g, "/")] ?? null, write: async (f, x) => void (t.files[f.replace(/\\/g, "/")] = x) } });
    expect((await next.page.handlers.automationInfo()).skill).toMatchObject({ state: "outdated", installedFor: "1.2.3" });
    expect((await next.page.handlers.automationSkill()).skill.state).toBe("current");
  });
  it("a write that fails is an error with the cause", async () => {
    const t = setup({
      skillFs: {
        read: async () => null,
        write: async () => {
          throw new Error("EPERM");
        },
      },
    });
    await expect(t.page.handlers.automationSkill()).rejects.toMatchObject({ error: { args: { detail: "EPERM" } } });
  });
});
