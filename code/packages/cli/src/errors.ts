import { AUTOMATION_ERROR_TEXT, exitCodeFor, type AutomationErrorCode } from "@speakkit/protocol";

/** A failure with a typed code: the command line prints it and exits with the code's exit status; the MCP server returns it as a tool error. */
export class CliError extends Error {
  readonly code: AutomationErrorCode;
  constructor(code: AutomationErrorCode, message?: string) {
    super(message ?? AUTOMATION_ERROR_TEXT[code]);
    this.code = code;
  }

  get exitCode(): number {
    return exitCodeFor(this.code);
  }
}
