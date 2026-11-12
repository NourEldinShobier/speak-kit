import path from "node:path";
import type { AutomationLimits } from "@speakkit/protocol";
import { installSkill, skillState, type Launcher, type SkillFs } from "@speakkit/cli";
import { DesktopFault } from "../../shared/errors";
import { mcpConfig, type AutomationCliAction, type AutomationInfo } from "../../shared/automation";

export interface PageDeps {
  platform: NodeJS.Platform;
  version: string;
  /** The app executable and the cli.js the launcher and the MCP entry run. */
  execPath: string;
  script: string;
  home: string;
  /** Absent on an OS without a launcher. */
  launcher: Launcher | null;
  skillFs: SkillFs;
  /** The limits of the running server, or null when it is not running. */
  limits(): Promise<AutomationLimits | null>;
  /** Opens a terminal window running `command` (starting in `dir` on Windows). */
  openTerminal(command: string, dir: string): Promise<void>;
}

/** The result of `work`, or null when it fails: a server that is not running has no limits to show. */
const orNull = async <T>(work: Promise<T>): Promise<T | null> => {
  try {
    return await work;
  } catch {
    return null;
  }
};

const fail = (e: unknown) => new DesktopFault({ code: "unexpected", args: { detail: e instanceof Error ? e.message : String(e) } });

/** What the Automation settings page reads and does: the state of the command line tool and the agent skill, and the actions on them. */
export function createAutomationPage(d: PageDeps) {
  const skillDir = path.join(d.home, ".claude", "skills");

  const info = async (changed = false): Promise<AutomationInfo> => {
    const [cli, skill, limits] = await Promise.all([d.launcher?.inspect() ?? null, skillState(d.skillFs, skillDir, d.version), orNull(d.limits())]);
    return {
      cli: cli && { state: cli.state, dir: cli.dir, onPath: cli.onPath, needsNewTerminal: cli.needsNewTerminal || changed, ...(cli.problem && { problem: cli.problem }) },
      skill: { state: skill.state, dir: skillDir, ...(skill.state === "outdated" && { installedFor: skill.installedFor }) },
      appVersion: d.version,
      limits,
      mcpConfig: mcpConfig({ onPath: !!cli && cli.state === "installed" && cli.onPath, execPath: d.execPath, script: d.script }),
    };
  };

  async function cli(action: AutomationCliAction): Promise<AutomationInfo> {
    const l = d.launcher;
    if (!l) throw fail(new Error("There is no command line launcher for this operating system."));
    try {
      if (action === "install") await l.install();
      else if (action === "remove") await l.remove();
      else {
        const now = await l.inspect();
        await d.openTerminal(d.platform === "win32" ? "speakkit capabilities" : `"${now.file}" capabilities`, now.dir);
      }
    } catch (e) {
      throw fail(e);
    }
    return info(action !== "test");
  }

  return {
    info,
    handlers: {
      automationInfo: () => info(),
      automationCli: cli,
      automationSkill: async () => {
        try {
          await installSkill(d.skillFs, skillDir, d.version);
        } catch (e) {
          throw fail(e);
        }
        return info();
      },
    },
  };
}
