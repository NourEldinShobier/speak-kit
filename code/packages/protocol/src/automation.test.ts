import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import {
  AUTOMATION_COMMANDS,
  AUTOMATION_ERROR_CODES,
  AUTOMATION_ERROR_STATUS,
  AUTOMATION_ERROR_TEXT,
  AUTOMATION_LIMITS,
  automationErrorSchema,
  automationExportRequestSchema,
  automationExportSchema,
  automationLimitsSchema,
  automationQueueSchema,
  automationSpeakRequestSchema,
  automationSpeakResultSchema,
  automationStatusSchema,
  automationStopRequestSchema,
  capabilities,
  capabilitiesSchema,
  exitCodeFor,
} from "./automation";

describe("error codes", () => {
  it("lists the codes in a fixed order", () => {
    expect([...AUTOMATION_ERROR_CODES]).toEqual([
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
    ]);
  });
  it("gives every code a sentence and an HTTP status", () => {
    for (const c of AUTOMATION_ERROR_CODES) {
      expect(AUTOMATION_ERROR_TEXT[c].endsWith(".")).toBe(true);
      expect(AUTOMATION_ERROR_STATUS[c]).toBeGreaterThanOrEqual(400);
    }
  });
  it.each([
    ["too_large", 1],
    ["model_missing", 1],
    ["busy", 1],
    ["queue_full", 1],
    ["failed", 1],
    ["invalid_input", 2],
    ["not_running", 3],
    ["token_rejected", 3],
  ] as const)("exit code of %s is %i", (code, exit) => {
    expect(exitCodeFor(code)).toBe(exit);
  });
});

describe("capabilities", () => {
  it("names what this version can and cannot do", () => {
    const c = capabilities("1.2.3");
    expect(c).toMatchObject({ app: "speakkit", version: "1.2.3", apiVersion: 1, exitCodes: { ok: 0, failed: 1, usage: 2, unreachable: 3 } });
    expect(c.commands.speak).toBe("available");
    expect(c.commands["live-stream"]).toBe("parked");
    expect(c.errors[3]).toEqual({ code: "too_large", message: "The file is over the 64 MiB limit." });
  });
  it("round-trips through its schema", () => {
    expect(v.parse(capabilitiesSchema, JSON.parse(JSON.stringify(capabilities("0.1.0"))))).toEqual(capabilities("0.1.0"));
  });
  it("refuses a version it does not know", () => {
    expect(v.safeParse(capabilitiesSchema, { ...capabilities("0.1.0"), apiVersion: 2 }).success).toBe(false);
  });
});

const STATUS = { status: "playing", title: "t", index: 1, total: 3, elapsedMs: 5, totalMs: 9, queued: 2 };
const LIMITS = { maxStreams: 1, maxWaiting: 2, maxTextChars: 3, maxQueued: 4, maxSubscribers: 5, heartbeatMs: 6, controlDeadlineMs: 7, streamIdleMs: 8 };
const keepsAll = (schema: v.GenericSchema, sample: unknown) => expect(v.parse(schema, sample)).toEqual(sample);
const needs = (schema: v.GenericSchema, sample: Record<string, unknown>) => {
  for (const key of Object.keys(sample)) expect(v.safeParse(schema, { ...sample, [key]: undefined }).success, `${key} is required`).toBe(false);
};

describe("every schema keeps what it is given and refuses what is missing", () => {
  it("status", () => {
    keepsAll(automationStatusSchema, STATUS);
    needs(automationStatusSchema, STATUS);
    for (const status of ["idle", "preparing", "playing", "paused", "finished", "error"]) expect(v.safeParse(automationStatusSchema, { ...STATUS, status }).success).toBe(true);
    expect(v.safeParse(automationStatusSchema, { ...STATUS, status: "dancing" }).success).toBe(false);
    expect(v.safeParse(automationStatusSchema, { ...STATUS, total: -1 }).success).toBe(false);
    expect(v.safeParse(automationStatusSchema, { ...STATUS, title: 5 }).success).toBe(false);
  });
  it("queue", () => {
    const q = { current: { title: "a", status: "paused", index: 0, total: 2 }, items: [{ id: "i", title: "b", chars: 3, addedAtMs: 4 }] };
    keepsAll(automationQueueSchema, q);
    keepsAll(automationQueueSchema, { current: null, items: [] });
    needs(automationQueueSchema, q);
    needs(automationQueueSchema, q.current);
    needs(automationQueueSchema, q.items[0]!);
    expect(v.safeParse(automationQueueSchema, { current: undefined, items: [] }).success).toBe(false);
  });
  it("speak result, with parts only when given", () => {
    const r = { id: "a", position: 1, sentences: 2, estimatedMs: 3 };
    keepsAll(automationSpeakResultSchema, r);
    keepsAll(automationSpeakResultSchema, { ...r, parts: ["x", "y"] });
    needs(automationSpeakResultSchema, r);
    expect(v.safeParse(automationSpeakResultSchema, { ...r, parts: [1] }).success).toBe(false);
  });
  it("export job, with every stage", () => {
    const e = { id: "a", stage: "done", progress: 1 };
    keepsAll(automationExportSchema, e);
    keepsAll(automationExportSchema, { ...e, path: "/x.mp3", error: "disk-full" });
    needs(automationExportSchema, e);
    for (const stage of ["rendering", "encoding", "saving", "done", "cancelled", "error"]) expect(v.safeParse(automationExportSchema, { ...e, stage }).success).toBe(true);
    expect(v.safeParse(automationExportSchema, { ...e, stage: "paused" }).success).toBe(false);
  });
  it("limits", () => {
    keepsAll(automationLimitsSchema, LIMITS);
    needs(automationLimitsSchema, LIMITS);
    expect(v.safeParse(automationLimitsSchema, { ...LIMITS, maxStreams: -1 }).success).toBe(false);
  });
  it("capabilities, with each command state and the exit codes it promises", () => {
    const c = capabilities("1.0.0");
    keepsAll(capabilitiesSchema, c);
    needs(capabilitiesSchema, c as unknown as Record<string, unknown>);
    expect(v.safeParse(capabilitiesSchema, { ...c, commands: { speak: "broken" } }).success).toBe(false);
    expect(v.safeParse(capabilitiesSchema, { ...c, commands: { dance: "available" } }).success).toBe(false);
    expect(v.safeParse(capabilitiesSchema, { ...c, exitCodes: { ...c.exitCodes, usage: 9 } }).success).toBe(false);
    expect(v.safeParse(capabilitiesSchema, { ...c, errors: [{ code: "nope", message: "x" }] }).success).toBe(false);
    expect(v.safeParse(capabilitiesSchema, { ...c, app: "other" }).success).toBe(false);
  });
  it("error body", () => {
    const e = { code: "busy", error: { code: "busy", message: "m" } };
    keepsAll(automationErrorSchema, e);
    needs(automationErrorSchema, e);
    needs(automationErrorSchema, e.error);
    expect(v.safeParse(automationErrorSchema, { code: "nope", error: { code: "nope", message: "x" } }).success).toBe(false);
  });
});

describe("request schemas", () => {
  it("speak request accepts both modes and refuses unknown keys", () => {
    keepsAll(automationSpeakRequestSchema, { text: "a", mode: "replace", dryRun: false });
    keepsAll(automationSpeakRequestSchema, { text: "a", mode: "queue" });
    keepsAll(automationSpeakRequestSchema, { text: "a" });
    expect(v.safeParse(automationSpeakRequestSchema, { text: "hi", mode: "later" }).success).toBe(false);
    expect(v.safeParse(automationSpeakRequestSchema, { text: "hi", extra: 1 }).success).toBe(false);
    expect(v.safeParse(automationSpeakRequestSchema, { text: 5 }).success).toBe(false);
    expect(v.safeParse(automationSpeakRequestSchema, { mode: "queue" }).success).toBe(false);
    expect(v.safeParse(automationSpeakRequestSchema, { text: "a", dryRun: "yes" }).success).toBe(false);
  });
  it("export request needs a text and an output path of 1 to 1024 characters", () => {
    keepsAll(automationExportRequestSchema, { text: "a", out: "x" });
    keepsAll(automationExportRequestSchema, { text: "a", out: "x".repeat(1024) });
    expect(v.safeParse(automationExportRequestSchema, { text: "a", out: "" }).success).toBe(false);
    expect(v.safeParse(automationExportRequestSchema, { text: "a", out: "x".repeat(1025) }).success).toBe(false);
    expect(v.safeParse(automationExportRequestSchema, { out: "x" }).success).toBe(false);
    expect(v.safeParse(automationExportRequestSchema, { text: "a", out: "x", more: 1 }).success).toBe(false);
  });
  it("stop request takes clear only", () => {
    keepsAll(automationStopRequestSchema, {});
    keepsAll(automationStopRequestSchema, { clear: true });
    expect(v.safeParse(automationStopRequestSchema, { clear: "yes" }).success).toBe(false);
    expect(v.safeParse(automationStopRequestSchema, { keep: true }).success).toBe(false);
  });
});

describe("the constants other code relies on", () => {
  it("fixes the HTTP status of every code", () => {
    expect(AUTOMATION_ERROR_STATUS).toEqual({
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
    });
  });
  it("fixes the sentence of every code", () => {
    expect(AUTOMATION_ERROR_TEXT).toEqual({
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
    });
  });
  it("fixes the limits and the state of every command", () => {
    expect(AUTOMATION_LIMITS).toEqual({ maxTextChars: 100_000, maxFileBytes: 64 * 1024 * 1024, maxQueued: 20, maxSubscribers: 4, heartbeatMs: 15_000 });
    expect(AUTOMATION_COMMANDS).toEqual({
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
    });
  });
});
