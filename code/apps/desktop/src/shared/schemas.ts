import * as v from "valibot";
import { DEFAULT_PORT, DEFAULT_VOICE } from "@speakkit/protocol";

/** Idle-unload choices shown in Settings > Memory; the value is what is stored. */
export const IDLE_CHOICES = ["1", "5", "15", "never"] as const;
export type IdleChoice = (typeof IDLE_CHOICES)[number];

const port = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(65535));
const bool = (d: boolean) => v.fallback(v.boolean(), d);

/** Persisted config (userData/config.json). Every field falls back to its default so a hand-edited or old file never breaks startup. */
export const ConfigSchema = v.object({
  setupDone: bool(false),
  setupSkipped: bool(false),
  preferredPort: v.fallback(port, DEFAULT_PORT),
  startMinimized: bool(false),
  language: v.fallback(v.picklist(["system", "en"]), "system"),
  theme: v.fallback(v.picklist(["system", "light", "dark"]), "system"),
  idleUnload: v.fallback(v.picklist(IDLE_CHOICES), "5"),
  loadAtStart: bool(false),
  batterySaver: bool(true),
  notifyDownload: bool(true),
  notifyError: bool(true),
  voice: v.fallback(v.pipe(v.string(), v.minLength(1), v.maxLength(64)), DEFAULT_VOICE),
  speed: v.fallback(v.pipe(v.number(), v.minValue(0.5), v.maxValue(3)), 1),
});
export type Config = v.InferOutput<typeof ConfigSchema>;

/** Parse whatever is on disk into a full Config; bad or missing fields take their defaults. */
export const parseConfig = (raw: unknown): Config => v.parse(ConfigSchema, raw && typeof raw === "object" ? raw : {});

/** The renderer may change these keys only. */
export const ConfigPatchSchema = v.partial(
  v.strictObject({
    setupDone: v.boolean(),
    setupSkipped: v.boolean(),
    startMinimized: v.boolean(),
    language: v.picklist(["system", "en"]),
    theme: v.picklist(["system", "light", "dark"]),
    idleUnload: v.picklist(IDLE_CHOICES),
    loadAtStart: v.boolean(),
    batterySaver: v.boolean(),
    notifyDownload: v.boolean(),
    notifyError: v.boolean(),
    voice: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
    speed: v.pipe(v.number(), v.minValue(0.5), v.maxValue(3)),
  }),
);
export type ConfigPatch = v.InferOutput<typeof ConfigPatchSchema>;

export const EXTERNAL_LINKS = ["webstore"] as const;
export const OPEN_PATHS = ["models", "logs"] as const;

/** Argument tuple schema per IPC method. Main validates every call with these before running the handler. */
export const ARGS = {
  state: v.tuple([]),
  patchConfig: v.tuple([ConfigPatchSchema]),
  setLaunchAtLogin: v.tuple([v.boolean()]),
  setPort: v.tuple([v.pipe(v.number(), v.integer(), v.minValue(1024), v.maxValue(65535))]),
  regenerateToken: v.tuple([]),
  retryEngine: v.tuple([]),
  downloadModel: v.tuple([]),
  voices: v.tuple([]),
  preview: v.tuple([
    v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
    v.pipe(v.string(), v.minLength(1), v.maxLength(5000)),
    v.optional(v.pipe(v.number(), v.minValue(0.5), v.maxValue(3))),
  ]),
  copy: v.tuple([v.pipe(v.string(), v.maxLength(10_000))]),
  openExternal: v.tuple([v.picklist(EXTERNAL_LINKS)]),
  openPath: v.tuple([v.picklist(OPEN_PATHS)]),
  storage: v.tuple([]),
  metrics: v.tuple([]),
  hideWindow: v.tuple([]),
  quit: v.tuple([]),
} as const;
