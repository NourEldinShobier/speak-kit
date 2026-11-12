import { describe, expect, it } from "vite-plus/test";
import { automationView, capabilityChips, mcpConfig, type AutomationInfo } from "./automation";

const base: AutomationInfo = {
  cli: { state: "installed", dir: "C:\\bin", onPath: true, needsNewTerminal: false },
  skill: { state: "current", dir: "C:\\skills" },
  appVersion: "0.5.2",
  limits: null,
  mcpConfig: "{}",
};
const view = (over: Partial<AutomationInfo>) => automationView({ ...base, ...over });

describe("command-line tool row", () => {
  it("installed: the pill, the version and PATH line, and Remove", () => {
    expect(view({}).cli).toEqual({
      pill: { tone: "green", label: "Installed" },
      line: "Version 0.5.2 · on your PATH for new terminals",
      action: { kind: "remove", label: "Remove", primary: false },
      terminal: { working: true },
    });
  });
  it("installed but not on the PATH says where it is", () => {
    expect(view({ cli: { state: "installed", dir: "/Users/me/.local/bin", onPath: false, needsNewTerminal: false } }).cli.line).toBe(
      "Version 0.5.2 · in /Users/me/.local/bin, which is not on your PATH yet",
    );
  });
  it("not installed: Put on PATH is the primary action and there is no terminal row", () => {
    const c = view({ cli: { state: "not-installed", dir: "C:\\bin", onPath: false, needsNewTerminal: false } }).cli;
    expect(c.action).toEqual({ kind: "install", label: "Put on PATH", primary: true });
    expect(c.terminal).toBeNull();
    expect(c.pill.label).toBe("Not installed");
  });
  it("broken: only the terminal row offers Repair, with the problem; the first row offers Remove", () => {
    const c = view({
      cli: { state: "broken", dir: "C:\\bin", onPath: true, needsNewTerminal: false, problem: "speakkit.cmd is missing in C:\\bin. Commands run but print nothing in a terminal." },
    }).cli;
    expect(c.action).toEqual({ kind: "remove", label: "Remove", primary: false });
    expect(c.terminal).toEqual({ working: false, problem: "speakkit.cmd is missing in C:\\bin. Commands run but print nothing in a terminal." });
    expect(c.pill).toEqual({ tone: "amber", label: "Needs repair" });
  });
  it("a broken launcher without a message still says something", () => {
    expect(view({ cli: { state: "broken", dir: "x", onPath: false, needsNewTerminal: false } }).cli.terminal?.problem).toBe("The speakkit command is not set up correctly.");
  });
  it("no launcher on this OS: nothing to click", () => {
    const c = view({ cli: null }).cli;
    expect([c.action, c.terminal, c.pill.label]).toEqual([null, null, "Not available"]);
  });
});

describe("skill row", () => {
  it("up to date", () => {
    expect(view({}).skill).toMatchObject({ title: "Speak Kit skill", line: "Version 0.5.2, the same as this app.", pill: { label: "Up to date" }, outOfDate: false });
  });
  it("out of date says both versions and offers the update", () => {
    const s = view({ skill: { state: "outdated", installedFor: "0.5.0", dir: "x" } }).skill;
    expect(s).toMatchObject({ title: "Speak Kit skill is out of date", action: { label: "Update skill", primary: true }, outOfDate: true, pill: null });
    expect(s.line).toBe("It is for 0.5.0 and the app is 0.5.2. Update it so the agent does not suggest commands that changed.");
  });
  it("not installed offers Install skill", () => {
    expect(view({ skill: { state: "none", dir: "x" } }).skill).toMatchObject({ action: { label: "Install skill", primary: true }, pill: { label: "Not installed" } });
  });
});

describe("limits", () => {
  it("shows the values of the running server", () => {
    const v = view({ limits: { maxStreams: 1, maxWaiting: 3, maxTextChars: 100_000, maxQueued: 20, maxSubscribers: 4, heartbeatMs: 15_000, controlDeadlineMs: 8000, streamIdleMs: 30_000 } });
    expect(v.limitsOffline).toBe(false);
    expect(v.limits.map((l) => [l.label, l.value])).toEqual([
      ["Live streams", "1"],
      ["Waiting requests", "3"],
      ["Waiting readings", "20"],
      ["Text per request", "100 000 characters"],
      ["Event streams", "4"],
      ["Wrong token", "401"],
    ]);
    expect(v.limits[0]!.description).toBe("One at a time. More get error 429 and can try again.");
    expect(v.limits[4]!.description).toContain("every 15 s");
  });
  it("falls back to the built-in values and says so while the server is not running", () => {
    const v = view({});
    expect(v.limitsOffline).toBe(true);
    expect(v.limits[0]!.description).toBe("2 at a time. More get error 429 and can try again.");
  });
});

describe("mcpConfig", () => {
  it("is short when speakkit is on the PATH", () => {
    expect(JSON.parse(mcpConfig({ onPath: true, execPath: "x", script: "y" }))).toEqual({ mcpServers: { speakkit: { command: "speakkit", args: ["mcp"] } } });
  });
  it("runs the app executable as Node otherwise", () => {
    expect(JSON.parse(mcpConfig({ onPath: false, execPath: "C:\\App\\Speak Kit.exe", script: "C:\\App\\cli.js" }))).toEqual({
      mcpServers: { speakkit: { command: "C:\\App\\Speak Kit.exe", args: ["C:\\App\\cli.js", "mcp"], env: { ELECTRON_RUN_AS_NODE: "1" } } },
    });
  });
});

describe("capabilityChips", () => {
  it("lists available commands first and parked ones last", () => {
    const chips = capabilityChips();
    const firstParked = chips.findIndex((c) => c.parked);
    expect(chips.slice(firstParked).every((c) => c.parked)).toBe(true);
    expect(chips.slice(0, firstParked).map((c) => c.name)).toContain("speak");
    expect(chips.filter((c) => c.parked).map((c) => c.name)).toEqual(["dictate", "history", "meetings", "live-stream"]);
  });
});
