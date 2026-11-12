import * as v from "valibot";
import { validHotkey } from "../dictation/keys";

export const CAPTURE_HOTKEY = "F9";
export const SCREENSHOT_HOTKEY = "F10";
export const RECORDING_HOTKEY = "F7";
export const TARGET_KINDS = ["ask", "screen", "window", "area"] as const;
export const INK_FADE_MS = [1000, 3000, 0] as const;
/** How long the capsule counts down before a finished recording goes to the voice chat. */
export const AUTO_SEND = ["off", "3s", "5s", "10s"] as const;
export const autoSendSeconds = (a: (typeof AUTO_SEND)[number]): number => (a === "off" ? 0 : Number.parseInt(a, 10));
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
  /** The screen recording key (experiment): one press starts a recording of the screen without narration, the next stops it. */
  recordingHotkey: v.fallback(v.pipe(v.string(), v.check(validHotkey)), RECORDING_HOTKEY),
  target: v.fallback(v.picklist(TARGET_KINDS), "ask"),
  narration: bool(true),
  otherAudio: v.fallback(v.picklist(["mute", "keep"]), "mute"),
  pointerTrail: bool(true),
  /** Shift held alone draws while recording. Off until chosen: a long Shift press before a shift-click would otherwise start drawing. */
  shiftInk: bool(false),
  inkFadeMs: v.fallback(v.picklist(INK_FADE_MS), 1000),
  folder: v.fallback(v.pipe(v.string(), v.maxLength(1024)), ""),
  retentionDays: v.fallback(v.picklist(RETENTION_DAYS), 30),
  autoSend: v.fallback(v.picklist(AUTO_SEND), "off"),
  /** Which speech engine makes the words of a capture: the model dictation loads, or a command of your own (needs the speech engines experiment). */
  narrationEngine: v.fallback(v.picklist(["dictation", "command"]), "dictation"),
  narrationCommand: v.fallback(v.pipe(v.string(), v.maxLength(500)), ""),
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
    recordingHotkey: v.pipe(v.string(), v.check(validHotkey)),
    target: v.picklist(TARGET_KINDS),
    narration: v.boolean(),
    otherAudio: v.picklist(["mute", "keep"]),
    pointerTrail: v.boolean(),
    shiftInk: v.boolean(),
    inkFadeMs: v.picklist(INK_FADE_MS),
    folder: v.pipe(v.string(), v.maxLength(1024)),
    retentionDays: v.picklist(RETENTION_DAYS),
    autoSend: v.picklist(AUTO_SEND),
    narrationEngine: v.picklist(["dictation", "command"]),
    narrationCommand: v.pipe(v.string(), v.maxLength(500)),
    inputLog: v.picklist(["events", "off"]),
    consented: v.boolean(),
    experiments: v.partial(v.strictObject(Object.fromEntries(EXPERIMENT_IDS.map((id) => [id, v.boolean()])) as Record<ExperimentId, v.BooleanSchema<undefined>>)),
  }),
);
export type CapturePatch = v.InferOutput<typeof CapturePatchSchema>;
