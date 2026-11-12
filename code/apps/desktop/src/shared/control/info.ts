/** What the Automation page shows for the command-line tool. */
export type CommandLineState =
  | { kind: "unavailable"; reason: string }
  | { kind: "not-installed" }
  | { kind: "installed"; where: string }
  /** The launcher is in place but a terminal will not find it until its folder is on the PATH. */
  | { kind: "needs-path"; where: string; folder: string }
  /** It was installed, and the launcher is gone or points at an app that moved. */
  | { kind: "needs-repair"; why: string };

/** What the Automation page needs to know that no setting holds. */
export interface AutomationInfo {
  /** The local server is listening. */
  running: boolean;
  /** Where scripts find its port and token. */
  discoveryFile: string;
  commandLine: CommandLineState;
  skill: AgentSkillState;
  /** One command a person can paste to do what Install does, or null where there is nothing to install. */
  manualInstall: string | null;
}

/** The agent skill file that teaches an AI agent the command line. `unreadable`: the file is there but could not be read. */
export interface AgentSkillState {
  state: "not-installed" | "up-to-date" | "out-of-date" | "unreadable";
  where: string;
}

export type CommandLineAction = "install" | "remove";

/** The command the Automation page offers to try, and the terminal it opens runs. */
export const TRY_COMMAND = "speakkit status --json";
