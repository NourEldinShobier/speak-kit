import { EXIT } from "../../../shared/control/contract";

/** Where the running app leaves the port and token for scripts, shown the way a person would type it on each system. */
export function discoveryPath(platform: string): string {
  return platform === "darwin" ? "~/Library/Application Support/Speak Kit/control.json" : "%APPDATA%\Speak Kit\control.json";
}

/** The block an AI app takes in its MCP settings. The tool starts the bridge itself and finds the token on its own, so none is written here. */
export const MCP_CONFIG = JSON.stringify({ mcpServers: { speakkit: { command: "speakkit", args: ["mcp"] } } }, null, 2);

export const TRY_COMMAND = "speakkit status --json";

export const EXIT_ROWS: readonly { code: number; text: string }[] = [
  { code: EXIT.ok, text: "Done" },
  { code: EXIT.failed, text: "The command failed. The message says why." },
  { code: EXIT.usage, text: "The command was not used correctly" },
  { code: EXIT.notRunning, text: "Speak Kit is not running" },
  { code: EXIT.noSpeech, text: "No speech was heard" },
];

export const DEEP_LINKS: readonly { url: string; text: string }[] = [
  { url: "speakkit://settings/shortcuts", text: "Opens Shortcuts." },
  { url: "speakkit://settings/diagnostics", text: "Opens Diagnostics, where you can copy a report." },
  { url: "speakkit://settings/experiments", text: "Opens Experiments." },
];
