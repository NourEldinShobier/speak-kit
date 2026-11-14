import * as v from "valibot";
import type { EngineState, Health, VoiceList } from "./api";
import type { EngineList, ExportJob } from "./engines";

/** Runtime schemas for what the server answers. Responses are a trust boundary: parse them, never cast. */
const engineState = v.picklist(["missing", "downloading", "unloaded", "loading", "ready", "error"] satisfies EngineState[]);
const engineId = v.literal("kokoro");

/** Shape of GET /v1/health. */
export const healthSchema: v.GenericSchema<unknown, Health> = v.object({
  app: v.literal("speakkit"),
  version: v.string(),
  // Any number parses so a client can report a version mismatch instead of "app not running".
  apiVersion: v.pipe(
    v.number(),
    v.transform((n) => n as Health["apiVersion"]),
  ),
  engine: v.object({
    id: engineId,
    state: engineState,
    progress: v.exactOptional(v.number()),
    detail: v.exactOptional(v.string()),
    idleUnloadAtMs: v.exactOptional(v.number()),
  }),
});

/** Shape of GET /v1/voices. */
export const voiceListSchema: v.GenericSchema<unknown, VoiceList> = v.object({
  voices: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      lang: v.picklist(["en-US", "en-GB"]),
      gender: v.picklist(["female", "male"]),
      quality: v.picklist(["A", "B", "C", "D"]),
      traits: v.exactOptional(v.string()),
    }),
  ),
  default: v.string(),
});

/** Shape of the engine list returned by the /v1/engines routes. */
export const engineListSchema: v.GenericSchema<unknown, EngineList> = v.object({
  active: engineId,
  engines: v.array(
    v.object({
      id: engineId,
      name: v.string(),
      state: engineState,
      progress: v.exactOptional(v.number()),
      detail: v.exactOptional(v.string()),
    }),
  ),
});

/** Shape of an export job (POST /v1/export, GET /v1/export/<id>). */
export const exportJobSchema: v.GenericSchema<unknown, ExportJob> = v.object({
  id: v.string(),
  state: v.picklist(["running", "done", "cancelled", "error"]),
  done: v.number(),
  total: v.number(),
  durationMs: v.number(),
  sentenceMs: v.exactOptional(v.array(v.tuple([v.number(), v.number()]))),
  error: v.exactOptional(v.string()),
});

/** Shape of every JSON error body: { error: { code, message } }. */
export const errorBodySchema = v.object({ error: v.object({ code: v.string(), message: v.string() }) });

const parser =
  <T>(schema: v.GenericSchema<unknown, T>) =>
  (x: unknown): T | undefined => {
    const r = v.safeParse(schema, x);
    return r.success ? r.output : undefined;
  };
/** Returns the parsed answer of GET /v1/health, or undefined when it does not match. */
export const parseHealth = parser(healthSchema);
/** Returns the parsed answer of GET /v1/voices, or undefined when it does not match. */
export const parseVoiceList = parser(voiceListSchema);
