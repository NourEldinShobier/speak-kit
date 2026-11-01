import type { Health, VoiceList } from "@speakkit/protocol";
import * as v from "valibot";

/** Server responses are a trust boundary: parse them instead of casting. */
export const healthSchema = v.object({
  app: v.literal("speakkit"),
  version: v.string(),
  apiVersion: v.number(),
  engine: v.object({
    id: v.string(),
    state: v.picklist(["missing", "downloading", "unloaded", "loading", "ready", "error"]),
    progress: v.optional(v.number()),
    detail: v.optional(v.string()),
    idleUnloadAtMs: v.optional(v.number()),
  }),
});

export const voiceListSchema = v.object({
  voices: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      lang: v.picklist(["en-US", "en-GB"]),
      gender: v.picklist(["female", "male"]),
      quality: v.picklist(["A", "B", "C", "D"]),
      traits: v.optional(v.string()),
    }),
  ),
  default: v.string(),
});

export const parseHealth = (x: unknown): Health | undefined => {
  const r = v.safeParse(healthSchema, x);
  return r.success ? (r.output as Health) : undefined;
};
export const parseVoiceList = (x: unknown): VoiceList | undefined => {
  const r = v.safeParse(voiceListSchema, x);
  return r.success ? (r.output as VoiceList) : undefined;
};
