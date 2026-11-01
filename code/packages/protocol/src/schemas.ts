import * as v from "valibot";
import type { EngineState, Health, VoiceList } from "./api";
import type { EngineList, ExportJob } from "./engines";

/** Runtime schemas for what the server answers. Responses are a trust boundary: parse them, never cast. */
const engineState = v.picklist(["missing", "downloading", "installing", "unavailable", "unloaded", "loading", "ready", "error"] satisfies EngineState[]);
const engineId = v.picklist(["kokoro", "chatterbox"]);

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
    progress: v.optional(v.number()),
    detail: v.optional(v.string()),
    idleUnloadAtMs: v.optional(v.number()),
  }),
});

export const voiceListSchema: v.GenericSchema<unknown, VoiceList> = v.object({
  voices: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      lang: v.picklist(["en-US", "en-GB"]),
      gender: v.picklist(["female", "male"]),
      quality: v.picklist(["A", "B", "C", "D"]),
      traits: v.optional(v.string()),
      cloned: v.optional(v.literal(true)),
    }),
  ),
  default: v.string(),
});

export const engineListSchema: v.GenericSchema<unknown, EngineList> = v.object({
  active: engineId,
  engines: v.array(
    v.object({
      id: engineId,
      name: v.string(),
      state: engineState,
      progress: v.optional(v.number()),
      detail: v.optional(v.string()),
      reason: v.optional(v.picklist(["no-gpu", "python-missing", "not-installed"])),
      optional: v.boolean(),
      cloning: v.boolean(),
      gpu: v.optional(v.object({ name: v.string(), vramMb: v.number() })),
    }),
  ),
});

export const exportJobSchema: v.GenericSchema<unknown, ExportJob> = v.object({
  id: v.string(),
  state: v.picklist(["running", "done", "cancelled", "error"]),
  done: v.number(),
  total: v.number(),
  durationMs: v.number(),
  error: v.optional(v.string()),
});

export const errorBodySchema = v.object({ error: v.object({ code: v.string(), message: v.string() }) });

const parser =
  <T>(schema: v.GenericSchema<unknown, T>) =>
  (x: unknown): T | undefined => {
    const r = v.safeParse(schema, x);
    return r.success ? r.output : undefined;
  };
export const parseHealth = parser(healthSchema);
export const parseVoiceList = parser(voiceListSchema);
