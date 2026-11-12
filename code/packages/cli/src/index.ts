/**
 * The speakkit command line and MCP server: the client of the app's local automation API, the agent skill text, and the launcher that puts
 * the command on the PATH. Runs inside the app's executable as plain Node, so it has no dependency of its own.
 */
export { runCli, describeStatus, type CliIo } from "./commands";
export { dataDirFor } from "./discover";
export { CliError } from "./errors";
export { createLauncher, terminalCommand, type CliInstall, type Launcher, type LauncherDeps } from "./launcher";
export { nodeLauncherDeps } from "./launcher/node";
export { nodeIo } from "./node-io";
export { installSkill, skillState, skillText, type SkillFs, type SkillState } from "./skill";
