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
}

export type CommandLineAction = "install" | "remove";
