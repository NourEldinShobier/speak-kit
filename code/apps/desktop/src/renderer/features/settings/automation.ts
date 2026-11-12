import { EXIT, type ErrorCode } from "../../../shared/control/contract";
import { TRY_COMMAND, type AgentSkillState, type CommandLineAction, type CommandLineState } from "../../../shared/control/info";
import { MCP_TOOLS, toolOn, type McpTool } from "../../../shared/control/mcp-tools";

/** The block an AI app takes in its MCP settings. The tool starts the bridge itself and finds the token on its own, so none is written here. */
export const MCP_CONFIG = JSON.stringify({ mcpServers: { speakkit: { command: "speakkit", args: ["mcp"] } } }, null, 2);

export { TRY_COMMAND };

export const EXIT_ROWS: readonly { code: number; text: string }[] = [
  { code: EXIT.ok, text: "Done" },
  { code: EXIT.failed, text: "The command failed. The message says why." },
  { code: EXIT.usage, text: "The command was not used correctly" },
  { code: EXIT.notRunning, text: "Speak Kit is not running" },
  { code: EXIT.noSpeech, text: "No speech was heard" },
];

/** One sentence per typed error code, the same ones the command line prints. */
export const ERROR_ROWS: Record<ErrorCode, string> = {
  usage: "The command was not used correctly.",
  "not-running": "Speak Kit is not running.",
  refused: "Speak Kit refused the request. The message says why.",
  busy: "Dictation or a meeting is already recording.",
  "no-speech": "No speech was heard.",
  cancelled: "The recording or export was cancelled.",
  unsupported: "This version does not have that command.",
  "too-large": "The text or file is over the limit.",
  timeout: "Speak Kit did not answer in time.",
  unauthorized: "The token is wrong or was reset.",
  "model-missing": "The speech model is not downloaded yet.",
  "queue-full": "The waiting list is full.",
  failed: "The request failed.",
};

/** What the commands do, one line each, as the Automation page lists them. */
export const COMMAND_ROWS: readonly { usage: string; text: string }[] = [
  { usage: "speak <text | file | ->", text: "Reads text or a file aloud. --queue waits its turn, --print shows the sentences, --out saves audio." },
  { usage: "queue, stop, voices", text: "Shows the waiting list, stops the reading, lists voices." },
  { usage: "dictate --print", text: "Records and prints the text instead of pasting it." },
  { usage: "history, meetings, capture", text: "Reads what you dictated, recorded or captured. Never starts Speak Kit." },
  { usage: "labs, settings", text: "Turns experiments on or off, reads and changes settings." },
];

export const DEEP_LINKS: readonly { url: string; text: string }[] = [
  { url: "speakkit://settings/shortcuts", text: "Opens Shortcuts." },
  { url: "speakkit://settings/diagnostics", text: "Opens Diagnostics, where you can copy a report." },
  { url: "speakkit://settings/experiments", text: "Opens Experiments." },
  { url: "speakkit://lab/caption-export", text: "Opens Experiments for one experiment. It never turns it on." },
];

export interface CommandLineView {
  pill: { tone: "green" | "neutral" | "orange"; text: string };
  text: string;
  action: { label: string; do: CommandLineAction } | null;
}

const NOT_INSTALLED = "Puts a speakkit command on your PATH. Only the folder of Speak Kit is added; the rest of your PATH stays as it is.";

/** What the command-line row says and offers in each state. */
export function commandLineView(s: CommandLineState, version: string): CommandLineView {
  switch (s.kind) {
    case "unavailable":
      return { pill: { tone: "neutral", text: "Not available" }, text: s.reason, action: null };
    case "not-installed":
      return { pill: { tone: "neutral", text: "Not installed" }, text: NOT_INSTALLED, action: { label: "Install", do: "install" } };
    case "installed":
      return { pill: { tone: "green", text: "Installed" }, text: `Version ${version} · on your PATH for new terminals`, action: { label: "Remove", do: "remove" } };
    case "needs-path":
      return {
        pill: { tone: "orange", text: "Needs your PATH" },
        text: `The launcher is in ${s.folder}, which is not on your PATH. Add that folder to your PATH, then open a new terminal.`,
        action: { label: "Remove", do: "remove" },
      };
    case "needs-repair":
      return { pill: { tone: "orange", text: "Needs repair" }, text: `${s.why} Repair puts it back.`, action: { label: "Repair", do: "install" } };
  }
}

export interface SkillView {
  pill: { tone: "green" | "neutral" | "orange"; text: string };
  text: string;
  action: { label: string } | null;
}

/** The command that writes the same skill file from a terminal, for the person who wants to run it themselves. */
export const SKILL_COMMAND = "speakkit skill install";

/** What the agent-skill row says and offers in each state. */
export function skillView(s: AgentSkillState): SkillView {
  switch (s.state) {
    case "not-installed":
      return {
        pill: { tone: "neutral", text: "Not installed" },
        text: "Teaches an AI agent such as Claude Code every speakkit command. Writes one file in your own folder.",
        action: { label: "Install" },
      };
    case "up-to-date":
      return { pill: { tone: "green", text: "Installed" }, text: `Up to date. The file is ${s.where}`, action: null };
    case "out-of-date":
      return { pill: { tone: "orange", text: "Update available" }, text: "The installed skill was written for another version of Speak Kit. Update replaces it.", action: { label: "Update" } };
    case "unreadable":
      return { pill: { tone: "orange", text: "Needs repair" }, text: "The skill file could not be read. Install writes it again.", action: { label: "Install" } };
  }
}

export interface ToolRow extends McpTool {
  on: boolean;
}

/** The MCP tools with whether each is on, in the order the page lists them. */
export const toolRows = (flags: Readonly<Record<string, boolean>>): ToolRow[] => MCP_TOOLS.map((t) => ({ ...t, on: toolOn(flags, t.name) }));
