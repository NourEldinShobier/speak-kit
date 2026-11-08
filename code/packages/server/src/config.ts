import * as v from "valibot";
import { MAX_SPEED, MIN_SPEED } from "@speakkit/protocol";

const MAX_SENTENCES = 500;
const MAX_SENTENCE_CHARS = 2000;
const MAX_HOLD_MS = 3_600_000;
export const DEFAULT_MAX_STREAMS = 2;
export const DEFAULT_MAX_QUEUE = 8;
/** Control routes (everything but the speak stream) answer within this or fail with 504. */
export const DEFAULT_CONTROL_DEADLINE_MS = 8_000;
/** A speak stream ends with synthesis-failed after this long without a frame. */
export const DEFAULT_STREAM_IDLE_MS = 30_000;
const MAX_DEADLINE_MS = 3_600_000;

const int = (min: number, max: number) => v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
/** An env var holding a non-negative integer in range. */
const envInt = (min: number, max: number) => v.pipe(v.string(), v.regex(/^\d+$/, "must be a non-negative integer"), v.transform(Number), v.minValue(min), v.maxValue(max));
const envBool = v.pipe(
  v.picklist(["0", "1", "true", "false"]),
  v.transform((s) => s === "1" || s === "true"),
);

const IDLE_MAX = 24 * 3_600_000;

/** Server options that are plain data (the engine is not validated here). */
const OptionsSchema = v.partial(
  v.object({
    port: int(0, 65535),
    idleUnloadMs: int(0, IDLE_MAX),
    maxStreams: int(1, 64),
    maxQueue: int(0, 1024),
    controlDeadlineMs: int(1, MAX_DEADLINE_MS),
    streamIdleMs: int(1, MAX_DEADLINE_MS),
    token: v.pipe(v.string(), v.minLength(1)),
    loadAtStart: v.boolean(),
  }),
);
type PlainOptions = v.InferOutput<typeof OptionsSchema>;

/** Environment read by the server and the CLI. Empty values count as unset. */
const EnvSchema = v.partial(
  v.object({
    SPEAKKIT_PORT: envInt(0, 65535),
    SPEAKKIT_IDLE_MS: envInt(0, IDLE_MAX),
    SPEAKKIT_MAX_STREAMS: envInt(1, 64),
    SPEAKKIT_MAX_QUEUE: envInt(0, 1024),
    SPEAKKIT_TOKEN: v.pipe(v.string(), v.minLength(1)),
    /** Comma-separated extension ids allowed to call; unset allows any extension that has the token. */
    SPEAKKIT_EXTENSION_IDS: v.pipe(
      v.string(),
      v.transform((s) =>
        s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ),
    SPEAKKIT_LOAD_AT_START: envBool,
    SPEAKKIT_ENGINE: v.picklist(["kokoro", "fake"]),
    SPEAKKIT_DTYPE: v.picklist(["fp32", "fp16", "q8", "uint8", "q4", "q4f16"]),
    SPEAKKIT_DEVICE: v.picklist(["cpu", "dml"]),
    SPEAKKIT_ISOLATION: v.picklist(["process", "thread"]),
    SPEAKKIT_THREADS: envInt(1, 64),
    SPEAKKIT_FAKE_STATE: v.picklist(["missing", "downloading", "unloaded", "loading", "ready", "error"]),
    SPEAKKIT_FAKE_LATENCY_MS: envInt(0, 600_000),
    SPEAKKIT_FAKE_LOAD_MS: envInt(0, 600_000),
    SPEAKKIT_FAKE_FAIL_ON: v.string(),
    SPEAKKIT_DATA_DIR: v.string(),
    SPEAKKIT_MODELS_DIR: v.string(),
    SPEAKKIT_WORKER_URL: v.string(),
  }),
);
type Env = v.InferOutput<typeof EnvSchema>;

const describe = (issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]]) => issues.map((i) => `${v.getDotPath(i) ?? "value"}: ${i.message}`).join("; ");

export function parseEnv(env: Record<string, string | undefined> = process.env): Env {
  const clean = Object.fromEntries(Object.entries(env).filter(([, x]) => x !== undefined && x !== ""));
  const r = v.safeParse(EnvSchema, clean);
  if (!r.success) throw new Error(`invalid environment: ${describe(r.issues)}`);
  return r.output;
}

export function parseOptions(o: Record<string, unknown>): PlainOptions {
  const r = v.safeParse(OptionsSchema, o);
  if (!r.success) throw new Error(`invalid server options: ${describe(r.issues)}`);
  return r.output;
}

export class RequestError extends Error {}

const BAD_BODY = "body must be a JSON object";
const BAD_SENTENCES = `sentences must be an array of 1..${MAX_SENTENCES} strings`;
const badSentence = (i: unknown) => `sentences[${String(i)}] must be a non-empty string of at most ${MAX_SENTENCE_CHARS} characters`;
const BAD_SPEED = `speed must be a number between ${MIN_SPEED} and ${MAX_SPEED}`;

/** First failing field decides the message, so the wire messages stay what the extension already sees. */
function firstMessage(issues: v.BaseIssue<unknown>[]): string {
  const i = issues[0]!;
  const path = (i.path ?? []).map((p) => p.key);
  switch (path[0]) {
    case undefined:
      return BAD_BODY;
    case "sentences":
      return path.length > 1 ? badSentence(path[1]) : BAD_SENTENCES;
    case "voice":
      return "unknown voice";
    default:
      return BAD_SPEED;
  }
}

const sentences = v.pipe(
  v.array(
    v.pipe(
      v.string(),
      v.check((s) => s.trim() !== ""),
      v.maxLength(MAX_SENTENCE_CHARS),
    ),
  ),
  v.minLength(1),
  v.maxLength(MAX_SENTENCES),
);
const voice = (voices: Set<string>) =>
  v.pipe(
    v.string(),
    v.check((s) => voices.has(s)),
  );

export function speakSchema(voices: Set<string>) {
  return v.object({
    sentences,
    voice: voice(voices),
    speed: v.pipe(v.number(), v.finite(), v.minValue(MIN_SPEED), v.maxValue(MAX_SPEED)),
  });
}

/** A WAV holds one sample rate and cannot be played faster in the player afterwards, so speed stops at the model maximum. */
const EXPORT_MAX_SPEED = 2;
const MAX_GAP_MS = 5000;
function exportSchema(voices: Set<string>) {
  return v.object({
    sentences,
    voice: voice(voices),
    speed: v.pipe(v.number(), v.finite(), v.minValue(MIN_SPEED), v.maxValue(EXPORT_MAX_SPEED)),
    gapMs: v.optional(int(0, MAX_GAP_MS), 150),
  });
}

/** Bodies of the newer endpoints: the message names the failing field. */
function parseNamed<S extends v.GenericSchema>(schema: S, body: unknown): v.InferOutput<S> {
  const r = v.safeParse(schema, body, { abortEarly: true });
  if (r.success) return r.output;
  const i = r.issues[0]!;
  throw new RequestError(`${v.getDotPath(i) ?? "body"}: ${i.message}`);
}
export const parseExport = (voices: Set<string>, body: unknown) => parseNamed(exportSchema(voices), body);

const REPLACE_ID = /^[\w.:-]{1,64}$/;
/** `X-SpeakKit-Replace`: `1` replaces every earlier stream of the token, anything else is a stream-group id (one per tab). */
export type Replace = { all: true } | { group: string };
export function parseReplace(header: string | string[] | undefined): Replace | undefined {
  if (header === undefined) return undefined;
  if (header === "1") return { all: true };
  if (typeof header === "string" && REPLACE_ID.test(header)) return { group: header };
  throw new RequestError("X-SpeakKit-Replace must be 1 or an id of 1 to 64 letters, digits, . _ : -");
}

const holdSchema = v.object({ ms: int(0, MAX_HOLD_MS) });

function parseBody<S extends v.GenericSchema>(schema: S, body: unknown): v.InferOutput<S> {
  const r = v.safeParse(schema, body, { abortEarly: true });
  if (r.success) return r.output;
  throw new RequestError(firstMessage(r.issues));
}

export const parseSpeak = (schema: ReturnType<typeof speakSchema>, body: unknown) => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new RequestError(BAD_BODY);
  return parseBody(schema, body);
};

export function parseHold(body: unknown): { ms: number } {
  const r = v.safeParse(holdSchema, body);
  if (r.success) return r.output;
  throw new RequestError(`ms must be an integer between 0 and ${MAX_HOLD_MS}`);
}
