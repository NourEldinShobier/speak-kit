import * as v from "valibot";
import { validHotkey } from "../dictation/keys";

export const CAPTURE_HOTKEY = "F9";
export const SCREENSHOT_HOTKEY = "F10";
export const TARGET_KINDS = ["ask", "screen", "window", "area"] as const;
export const INK_FADE_MS = [1000, 3000, 0] as const;
export const RETENTION_DAYS = [7, 30, 90, 0] as const;
export const EXPERIMENT_IDS = ["screenshots", "recording", "replay", "zoomExport", "agentContext", "pageContext", "speechEngines", "playground"] as const;
export type ExperimentId = (typeof EXPERIMENT_IDS)[number];

const bool = (d: boolean) => v.fallback(v.boolean(), d);
const experiments = v.fallback(
  v.object(Object.fromEntries(EXPERIMENT_IDS.map((id) => [id, bool(false)])) as Record<ExperimentId, ReturnType<typeof bool>>),
  Object.fromEntries(EXPERIMENT_IDS.map((id) => [id, false])) as Record<ExperimentId, boolean>,
);

/** Persisted under `capture` in config.json. Off until the person turns it on; each key falls back to its default so files from before capture existed load. */
export const CaptureConfigSchema = v.object({
  enabled: bool(false),
  hotkey: v.fallback(v.pipe(v.string(), v.check(validHotkey)), CAPTURE_HOTKEY),
  screenshotHotkey: v.fallback(v.pipe(v.string(), v.check(validHotkey)), SCREENSHOT_HOTKEY),
  target: v.fallback(v.picklist(TARGET_KINDS), "ask"),
  narration: bool(true),
  otherAudio: v.fallback(v.picklist(["mute", "keep"]), "mute"),
  pointerTrail: bool(true),
  inkFadeMs: v.fallback(v.picklist(INK_FADE_MS), 1000),
  folder: v.fallback(v.pipe(v.string(), v.maxLength(1024)), ""),
  retentionDays: v.fallback(v.picklist(RETENTION_DAYS), 30),
  autoSend: v.fallback(v.picklist(["off", "3s"]), "off"),
  /** What the log of input events holds: events (click, key counts), never typed text. */
  inputLog: v.fallback(v.picklist(["events", "off"]), "events"),
  consented: bool(false),
  /** Last choice per display id, so the picker starts where the person left off. */
  lastTargets: v.fallback(v.record(v.string(), v.picklist(["screen", "window", "area"])), {}),
  experiments,
});
export type CaptureConfig = v.InferOutput<typeof CaptureConfigSchema>;

export const CapturePatchSchema = v.partial(
  v.strictObject({
    hotkey: v.pipe(v.string(), v.check(validHotkey)),
    screenshotHotkey: v.pipe(v.string(), v.check(validHotkey)),
    target: v.picklist(TARGET_KINDS),
    narration: v.boolean(),
    otherAudio: v.picklist(["mute", "keep"]),
    pointerTrail: v.boolean(),
    inkFadeMs: v.picklist(INK_FADE_MS),
    folder: v.pipe(v.string(), v.maxLength(1024)),
    retentionDays: v.picklist(RETENTION_DAYS),
    autoSend: v.picklist(["off", "3s"]),
    inputLog: v.picklist(["events", "off"]),
    consented: v.boolean(),
    experiments: v.partial(v.strictObject(Object.fromEntries(EXPERIMENT_IDS.map((id) => [id, v.boolean()])) as Record<ExperimentId, v.BooleanSchema<undefined>>)),
  }),
);
export type CapturePatch = v.InferOutput<typeof CapturePatchSchema>;
