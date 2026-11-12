import { AUTOMATION_COMMANDS, AUTOMATION_LIMITS, type AutomationCommand, type AutomationLimits } from "@speakkit/protocol";

/** What the Automation page needs from main, in one object. */
export interface AutomationInfo {
  /** Null where this OS has no launcher (the command line tool then runs only from a terminal that was given the app's path). */
  cli: {
    state: "not-installed" | "installed" | "broken";
    dir: string;
    onPath: boolean;
    problem?: string;
    /** A change was just made: open terminals still have the old PATH. */
    needsNewTerminal: boolean;
  } | null;
  skill: { state: "none" | "current" | "outdated"; installedFor?: string; dir: string };
  appVersion: string;
  /** Actual limits of the running server, or null while it is not running. */
  limits: AutomationLimits | null;
  /** The MCP server entry for an AI app's configuration file, as JSON text. */
  mcpConfig: string;
}

export type AutomationCliAction = "install" | "remove" | "test";

/** The text people paste to install or check things, so the page and the tests say the same words. */
export const COMMANDS = {
  capabilities: "speakkit capabilities --json",
  speakFile: "speakkit speak notes.md --out notes.mp3",
  print: 'speakkit speak --print "Some text to check."',
  installSkill: "speakkit skill install",
} as const;

/** The MCP server entry. With the command on the PATH it is short; without, it runs the app's own executable as Node on cli.js. */
export function mcpConfig(o: { onPath: boolean; execPath: string; script: string }): string {
  const server = o.onPath ? { command: "speakkit", args: ["mcp"] } : { command: o.execPath, args: [o.script, "mcp"], env: { ELECTRON_RUN_AS_NODE: "1" } };
  return JSON.stringify({ mcpServers: { speakkit: server } }, null, 2);
}

export interface CapabilityChip {
  name: AutomationCommand;
  parked: boolean;
}

/** Every command of this version for the chips, available ones first in their own order. */
export const capabilityChips = (): CapabilityChip[] => {
  const all = (Object.keys(AUTOMATION_COMMANDS) as AutomationCommand[]).map((name) => ({ name, parked: AUTOMATION_COMMANDS[name] === "parked" }));
  return [...all.filter((c) => !c.parked), ...all.filter((c) => c.parked)];
};

type Pill = { tone: "green" | "amber" | "neutral"; label: string };

export interface AutomationView {
  cli: {
    pill: Pill;
    line: string;
    action: { kind: "install" | "remove"; label: string; primary: boolean } | null;
    /** Terminal output row: null when nothing is installed. `problem` is set for the red state. */
    terminal: { working: boolean; problem?: string } | null;
  };
  skill: { title: string; line: string; pill: Pill | null; action: { label: string; primary: boolean }; outOfDate: boolean };
  limits: { label: string; description: string; value: string }[];
  /** The limits above are the built-in ones because the server is not running. */
  limitsOffline: boolean;
}

const num = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

function cliView(info: AutomationInfo): AutomationView["cli"] {
  const c = info.cli;
  if (!c) return { pill: { tone: "neutral", label: "Not available" }, line: "Putting speakkit on the PATH is not supported on this computer.", action: null, terminal: null };
  if (c.state === "installed") {
    return {
      pill: { tone: "green", label: "Installed" },
      line: `Version ${info.appVersion} · ${c.onPath ? "on your PATH for new terminals" : `in ${c.dir}, which is not on your PATH yet`}`,
      action: { kind: "remove", label: "Remove", primary: false },
      terminal: { working: true },
    };
  }
  if (c.state === "broken") {
    const problem = c.problem ?? "The speakkit command is not set up correctly.";
    // The way out is the Repair button of the terminal row below; this row only offers to take the command away.
    return { pill: { tone: "amber", label: "Needs repair" }, line: problem, action: { kind: "remove", label: "Remove", primary: false }, terminal: { working: false, problem } };
  }
  return {
    pill: { tone: "neutral", label: "Not installed" },
    line: "Put the speakkit command on your PATH so scripts and AI apps can use it.",
    action: { kind: "install", label: "Put on PATH", primary: true },
    terminal: null,
  };
}

function skillView(info: AutomationInfo): AutomationView["skill"] {
  const s = info.skill;
  if (s.state === "current")
    return {
      title: "Speak Kit skill",
      line: `Version ${info.appVersion}, the same as this app.`,
      pill: { tone: "green", label: "Up to date" },
      action: { label: "Reinstall", primary: false },
      outOfDate: false,
    };
  if (s.state === "outdated") {
    return {
      title: "Speak Kit skill is out of date",
      line: `It is for ${s.installedFor ?? "an unknown version"} and the app is ${info.appVersion}. Update it so the agent does not suggest commands that changed.`,
      pill: null,
      action: { label: "Update skill", primary: true },
      outOfDate: true,
    };
  }
  return {
    title: "Speak Kit skill",
    line: "Not installed. A short guide that teaches an AI agent the speakkit commands.",
    pill: { tone: "neutral", label: "Not installed" },
    action: { label: "Install skill", primary: true },
    outOfDate: false,
  };
}

/** The limits shown: the running server's, or the built-in ones while it is not running. */
function limitRows(info: AutomationInfo): AutomationView["limits"] {
  const l = info.limits ?? {
    maxStreams: 2,
    maxWaiting: 8,
    maxTextChars: AUTOMATION_LIMITS.maxTextChars,
    maxQueued: AUTOMATION_LIMITS.maxQueued,
    maxSubscribers: AUTOMATION_LIMITS.maxSubscribers,
    heartbeatMs: AUTOMATION_LIMITS.heartbeatMs,
  };
  return [
    { label: "Live streams", description: `${l.maxStreams === 1 ? "One at a time" : `${l.maxStreams} at a time`}. More get error 429 and can try again.`, value: String(l.maxStreams) },
    { label: "Waiting requests", description: "Requests wait in line. When the line is full they get error 429 too.", value: String(l.maxWaiting) },
    { label: "Waiting readings", description: "Readings queued with speak --queue. The next one gets queue_full.", value: String(l.maxQueued) },
    { label: "Text per request", description: "Longer text is refused with too_large before anything is spoken.", value: `${num(l.maxTextChars)} characters` },
    {
      label: "Event streams",
      description: `At most ${l.maxSubscribers} at once. Each gets a heartbeat every ${Math.round(l.heartbeatMs / 1000)} s so a dead connection is noticed.`,
      value: String(l.maxSubscribers),
    },
    { label: "Wrong token", description: "A request with the wrong token gets error 401 and nothing else.", value: "401" },
  ];
}

/** Words and states of the Automation page from the main process info. Pure; the component only draws it. */
export const automationView = (info: AutomationInfo): AutomationView => ({ cli: cliView(info), skill: skillView(info), limitsOffline: info.limits === null, limits: limitRows(info) });
