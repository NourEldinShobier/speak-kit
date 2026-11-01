import * as v from "valibot";
import type { EngineList, ExportJob } from "@speakkit/protocol";

/** Shapes of what the local server answers on the engine and export routes (packages/protocol/src/engines.ts). */
const EngineState = v.picklist(["missing", "downloading", "installing", "unavailable", "unloaded", "loading", "ready", "error"]);

export const EngineListSchema: v.GenericSchema<unknown, EngineList> = v.object({
  active: v.picklist(["kokoro", "chatterbox"]),
  engines: v.array(
    v.object({
      id: v.picklist(["kokoro", "chatterbox"]),
      name: v.string(),
      state: EngineState,
      progress: v.optional(v.number()),
      detail: v.optional(v.string()),
      reason: v.optional(v.picklist(["no-gpu", "python-missing", "not-installed"])),
      optional: v.boolean(),
      cloning: v.boolean(),
      gpu: v.optional(v.object({ name: v.string(), vramMb: v.number() })),
    }),
  ),
});

export const ExportJobSchema: v.GenericSchema<unknown, ExportJob> = v.object({
  id: v.string(),
  state: v.picklist(["running", "done", "cancelled", "error"]),
  done: v.number(),
  total: v.number(),
  durationMs: v.number(),
  error: v.optional(v.string()),
});

export const ErrorBodySchema = v.object({ error: v.object({ code: v.string(), message: v.string() }) });
