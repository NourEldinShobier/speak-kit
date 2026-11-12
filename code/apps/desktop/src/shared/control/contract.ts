import * as v from "valibot";

/** Bumped when a command or a reply field changes in a way a script would notice. Every JSON reply carries it. */
export const CONTROL_VERSION = 1;

/** Process exit codes of the command line. */
export const EXIT = { ok: 0, failed: 1, usage: 2, notRunning: 3, noSpeech: 4 } as const;
export type Exit = (typeof EXIT)[keyof typeof EXIT];

export const ERROR_CODES = ["usage", "not-running", "refused", "busy", "no-speech", "cancelled", "unsupported", "too-large", "timeout", "unauthorized", "failed"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const LIMITS = {
  /** Largest request body the server reads. */
  requestBytes: 64 * 1024,
  /** Largest reply the server sends. */
  replyBytes: 1024 * 1024,
  /** Every command but a print capture ends within this. */
  timeoutMs: 10_000,
  /** How long `stop --print` waits for the text. */
  printWaitMs: 60_000,
  /** Largest file `speak` reads. */
  speakFileBytes: 64 * 1024 * 1024,
} as const;

export const COMMANDS = ["capabilities", "status", "read", "pause", "resume", "stop", "voice", "dictate", "settings", "history", "meetings", "speak", "skill"] as const;
export type Command = (typeof COMMANDS)[number];

/** What this version can do, so a script or the browser extension asks instead of comparing version numbers. */
export const CAPABILITIES = {
  commands: [...COMMANDS],
  features: { print: true, raw: true, settings: true, history: true, meetings: false, speak: false, liveStream: false, mcp: true },
  errors: [...ERROR_CODES],
  limits: LIMITS,
} as const;

export const ControlRequestSchema = v.object({
  command: v.picklist(COMMANDS),
  args: v.optional(v.record(v.string(), v.unknown()), {}),
});
export type ControlRequest = v.InferOutput<typeof ControlRequestSchema>;

export type Reply = { ok: true; version: number; data: unknown } | { ok: false; version: number; error: { code: ErrorCode; message: string } };

export const ok = (data: unknown = {}): Extract<Reply, { ok: true }> => ({ ok: true, version: CONTROL_VERSION, data });
export const fail = (code: ErrorCode, message: string): Extract<Reply, { ok: false }> => ({ ok: false, version: CONTROL_VERSION, error: { code, message } });

/** The exit code a reply ends the command with. */
export function exitFor(r: Reply): Exit {
  if (r.ok) return EXIT.ok;
  if (r.error.code === "no-speech") return EXIT.noSpeech;
  if (r.error.code === "not-running") return EXIT.notRunning;
  return r.error.code === "usage" ? EXIT.usage : EXIT.failed;
}
