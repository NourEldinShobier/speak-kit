import * as v from "valibot";

/** Where the recording pill sits on the screen under the pointer, or never. */
export const INDICATORS = ["top", "bottom", "off"] as const;
export type Indicator = (typeof INDICATORS)[number];
/** What the kept recordings may take up together, in megabytes. */
export const AUDIO_CAPS_MB = [128, 512, 2048] as const;
/** Short tones when a recording starts, stops and fails. Off until the person turns them on; volume is 0 to 100. */
export const SoundsSchema = v.object({ enabled: v.fallback(v.boolean(), false), volume: v.fallback(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)), 50) });
