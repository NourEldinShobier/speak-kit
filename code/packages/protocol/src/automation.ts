import * as v from "valibot";

/**
 * Automation: what the command line tool and the MCP server ask of the running app. All routes need the bearer token.
 *
 *   GET  /v1/limits                 -> AutomationLimits
 *   GET  /v1/capabilities           -> Capabilities
 *   GET  /v1/automation/status      -> AutomationStatus
 *   GET  /v1/automation/queue       -> AutomationQueue
 *   POST /v1/automation/speak       -> body AutomationSpeakRequest, 202 AutomationSpeakResult
 *   POST /v1/automation/stop        -> body { clear?: boolean }, 200 AutomationStatus
 *   POST /v1/automation/export      -> body AutomationExportRequest, 202 AutomationExport
 *   GET  /v1/automation/export/<id> -> AutomationExport
 *   GET  /v1/automation/events      -> text/event-stream; one `status` event (AutomationStatus) now and after every change, a `: hb` comment every `heartbeatMs`
 *
 * A failure answers { code, error: { code, message } } with the HTTP status of AUTOMATION_ERROR_STATUS.
 */
export const AUTOMATION_ERROR_CODES = [
  "model_missing",
  "busy",
  "permission_denied",
  "too_large",
  "unsupported",
  "queue_full",
  "invalid_input",
  "not_running",
  "token_rejected",
  "timeout",
  "failed",
] as const;
export type AutomationErrorCode = (typeof AUTOMATION_ERROR_CODES)[number];

/** One line per code, said the same way by the command line, the MCP server and the Automation page. */
export const AUTOMATION_ERROR_TEXT: Record<AutomationErrorCode, string> = {
  model_missing: "The speech model is not downloaded yet.",
  busy: "Dictation or a meeting is already recording.",
  permission_denied: "The operating system is blocking access to the microphone.",
  too_large: "The file is over the 64 MiB limit.",
  unsupported: "This version does not have that command.",
  queue_full: "The waiting list is full. Wait for a reading to finish or clear the queue.",
  invalid_input: "The request is empty or not valid.",
  not_running: "Speak Kit is not running.",
  token_rejected: "The token is wrong or was regenerated.",
  timeout: "Speak Kit did not answer in time.",
  failed: "The request failed.",
};

/** HTTP status per code (the two that only the client can know, not_running and token_rejected, are never sent by the server). */
export const AUTOMATION_ERROR_STATUS: Record<AutomationErrorCode, number> = {
  model_missing: 409,
  busy: 409,
  permission_denied: 403,
  too_large: 413,
  unsupported: 501,
  queue_full: 429,
  invalid_input: 400,
  not_running: 503,
  token_rejected: 401,
  timeout: 504,
  failed: 500,
};

export const AUTOMATION_LIMITS = {
  /** Characters one speak request may carry; the reader stops at the same number. */
  maxTextChars: 100_000,
  /** A file given to `speak <file>` is refused above this many bytes before anything is read into memory. */
  maxFileBytes: 64 * 1024 * 1024,
  /** Readings waiting behind the one playing. */
  maxQueued: 20,
  /** Open event streams at once. */
  maxSubscribers: 4,
  /** A stream that reports nothing for this long gets a heartbeat comment, so a dead connection is noticed. */
  heartbeatMs: 15_000,
} as const;

/** Commands of this version. `parked` is named in the capability list but does nothing yet. */
export const AUTOMATION_COMMANDS = {
  speak: "available",
  stop: "available",
  status: "available",
  queue: "available",
  voices: "available",
  export: "available",
  events: "available",
  capabilities: "available",
  mcp: "available",
  skill: "available",
  dictate: "parked",
  history: "parked",
  meetings: "parked",
  "live-stream": "parked",
} as const;
export type AutomationCommand = keyof typeof AUTOMATION_COMMANDS;
export type CommandState = (typeof AUTOMATION_COMMANDS)[AutomationCommand];

/** Exit codes of the command line, the same for every command: 0 done, 1 the request failed (the code is printed), 2 wrong usage, 3 the app could not be reached or trusted us. */
export const EXIT_CODES = { ok: 0, failed: 1, usage: 2, unreachable: 3 } as const;
export function exitCodeFor(code: AutomationErrorCode): number {
  if (code === "not_running" || code === "token_rejected") return EXIT_CODES.unreachable;
  return code === "invalid_input" ? EXIT_CODES.usage : EXIT_CODES.failed;
}

export interface Capabilities {
  app: "speakkit";
  version: string;
  apiVersion: 1;
  commands: Record<AutomationCommand, CommandState>;
  errors: { code: AutomationErrorCode; message: string }[];
  exitCodes: typeof EXIT_CODES;
}

export interface AutomationLimits {
  /** Speak streams synthesizing at once, and how many wait behind them before HTTP 429. */
  maxStreams: number;
  maxWaiting: number;
  maxTextChars: number;
  maxQueued: number;
  maxSubscribers: number;
  heartbeatMs: number;
  controlDeadlineMs: number;
  streamIdleMs: number;
}

export type ReadingStatus = "idle" | "preparing" | "playing" | "paused" | "finished" | "error";

export interface AutomationStatus {
  status: ReadingStatus;
  /** First words of what is being read. */
  title: string;
  index: number;
  total: number;
  elapsedMs: number;
  totalMs: number;
  /** Readings waiting behind this one. */
  queued: number;
}

export interface AutomationQueueItem {
  id: string;
  title: string;
  chars: number;
  addedAtMs: number;
}

export interface AutomationQueue {
  current: { title: string; status: ReadingStatus; index: number; total: number } | null;
  items: AutomationQueueItem[];
}

export interface AutomationSpeakRequest {
  text: string;
  /** replace (default): stop what is playing and read this now. queue: read it after what is playing and waiting. */
  mode?: "replace" | "queue";
  /** Print mode: split the text as the reader would and answer with the parts; nothing is spoken or queued. */
  dryRun?: boolean;
}

export interface AutomationSpeakResult {
  /** Empty for a dry run. */
  id: string;
  /** 0 when it starts now, else its place in the waiting list (1 is next). */
  position: number;
  sentences: number;
  estimatedMs: number;
  /** Only for a dry run: the sentences, in order. */
  parts?: string[];
}

export interface AutomationExportRequest {
  text: string;
  /** Absolute path ending in .mp3 or .wav. */
  out: string;
}

export interface AutomationExport {
  id: string;
  stage: "rendering" | "encoding" | "saving" | "done" | "cancelled" | "error";
  progress: number;
  path?: string;
  error?: string;
}

const status = v.picklist(["idle", "preparing", "playing", "paused", "finished", "error"] satisfies ReadingStatus[]);
const num = v.pipe(v.number(), v.minValue(0));

export const automationStatusSchema: v.GenericSchema<unknown, AutomationStatus> = v.object({ status, title: v.string(), index: num, total: num, elapsedMs: num, totalMs: num, queued: num });
export const automationQueueSchema: v.GenericSchema<unknown, AutomationQueue> = v.object({
  current: v.nullable(v.object({ title: v.string(), status, index: num, total: num })),
  items: v.array(v.object({ id: v.string(), title: v.string(), chars: num, addedAtMs: num })),
});
export const automationSpeakResultSchema: v.GenericSchema<unknown, AutomationSpeakResult> = v.object({
  id: v.string(),
  position: num,
  sentences: num,
  estimatedMs: num,
  parts: v.exactOptional(v.array(v.string())),
});
export const automationExportSchema: v.GenericSchema<unknown, AutomationExport> = v.object({
  id: v.string(),
  stage: v.picklist(["rendering", "encoding", "saving", "done", "cancelled", "error"]),
  progress: num,
  path: v.exactOptional(v.string()),
  error: v.exactOptional(v.string()),
});
export const automationLimitsSchema: v.GenericSchema<unknown, AutomationLimits> = v.object({
  maxStreams: num,
  maxWaiting: num,
  maxTextChars: num,
  maxQueued: num,
  maxSubscribers: num,
  heartbeatMs: num,
  controlDeadlineMs: num,
  streamIdleMs: num,
});
export const capabilitiesSchema: v.GenericSchema<unknown, Capabilities> = v.object({
  app: v.literal("speakkit"),
  version: v.string(),
  apiVersion: v.literal(1),
  commands: v.record(v.picklist(Object.keys(AUTOMATION_COMMANDS) as AutomationCommand[]), v.picklist(["available", "parked"])) as v.GenericSchema<unknown, Capabilities["commands"]>,
  errors: v.array(v.object({ code: v.picklist(AUTOMATION_ERROR_CODES), message: v.string() })),
  exitCodes: v.object({ ok: v.literal(0), failed: v.literal(1), usage: v.literal(2), unreachable: v.literal(3) }),
});
/** Body of every automation failure. */
export const automationErrorSchema = v.object({ code: v.picklist(AUTOMATION_ERROR_CODES), error: v.object({ code: v.string(), message: v.string() }) });
export type AutomationError = v.InferOutput<typeof automationErrorSchema>;

export const automationSpeakRequestSchema = v.strictObject({
  text: v.string(),
  mode: v.exactOptional(v.picklist(["replace", "queue"])),
  dryRun: v.exactOptional(v.boolean()),
});
export const automationExportRequestSchema = v.strictObject({ text: v.string(), out: v.pipe(v.string(), v.minLength(1), v.maxLength(1024)) });
export const automationStopRequestSchema = v.strictObject({ clear: v.exactOptional(v.boolean()) });

/** What this build answers to GET /v1/capabilities, apart from the app version. */
export const capabilities = (version: string): Capabilities => ({
  app: "speakkit",
  version,
  apiVersion: 1,
  commands: { ...AUTOMATION_COMMANDS },
  errors: AUTOMATION_ERROR_CODES.map((code) => ({ code, message: AUTOMATION_ERROR_TEXT[code] })),
  exitCodes: EXIT_CODES,
});
