import * as v from "valibot";
import { DEFAULT_PORT, DEFAULT_VOICE } from "@speakkit/protocol";
import { UPDATE_ACTIONS } from "./updates";
import { DEFAULT_SHORTCUTS, SHORTCUT_IDS, checkAccelerator, normalize } from "./shortcuts";

/** Idle-unload choices shown in Settings > Memory; the value is what is stored. */
export const IDLE_CHOICES = ["1", "5", "15", "never"] as const;
export type IdleChoice = (typeof IDLE_CHOICES)[number];

const bool = (d: boolean) => v.fallback(v.boolean(), d);

/** Events in Settings > Notifications; each can show a Windows toast, a line in the bell, and play a sound. */
export const NOTIFY_EVENTS = ["reading-finished", "export-done", "engine-error", "update-ready"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];
export const NOTIFY_CHANNELS = ["toast", "bell", "sound"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];
const channelsOf = (toast: boolean, bell: boolean, sound: boolean) => v.fallback(v.object({ toast: bool(toast), bell: bool(bell), sound: bool(sound) }), { toast, bell, sound });
const NotificationsSchema = v.object({
  "reading-finished": channelsOf(false, false, false),
  "export-done": channelsOf(true, true, false),
  "engine-error": channelsOf(true, true, true),
  "update-ready": channelsOf(true, true, false),
});
export type Notifications = v.InferOutput<typeof NotificationsSchema>;

const accelerator = (id: (typeof SHORTCUT_IDS)[number]) =>
  v.fallback(
    v.pipe(
      v.string(),
      v.check((a) => checkAccelerator(a) === null),
      v.transform((a) => normalize(a)!),
    ),
    DEFAULT_SHORTCUTS[id],
  );
const ShortcutsSchema = v.object({
  "read-selection": accelerator("read-selection"),
  "play-pause": accelerator("play-pause"),
  stop: accelerator("stop"),
});

const EXPORT_FORMATS = ["wav", "mp3"] as const;
export const MP3_KBPS = [128, 192, 256] as const;
const ExportPrefsSchema = v.fallback(
  v.object({
    format: v.fallback(v.picklist(EXPORT_FORMATS), "mp3"),
    mp3Kbps: v.fallback(v.picklist(MP3_KBPS), 192),
    folder: v.fallback(v.pipe(v.string(), v.maxLength(1024)), ""),
  }),
  { format: "mp3", mp3Kbps: 192, folder: "" },
);
export type ExportPrefs = v.InferOutput<typeof ExportPrefsSchema>;

const port = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(65535));

/** Persisted config (userData/config.json). Every field falls back to its default so a hand-edited or old file never breaks startup. */
export const ConfigSchema = v.object({
  setupDone: bool(false),
  setupSkipped: bool(false),
  preferredPort: v.fallback(port, DEFAULT_PORT),
  startMinimized: bool(false),
  language: v.fallback(v.picklist(["system", "en"]), "system"),
  idleUnload: v.fallback(v.picklist(IDLE_CHOICES), "5"),
  loadAtStart: bool(false),
  batterySaver: bool(true),
  notifications: v.fallback(NotificationsSchema, v.parse(NotificationsSchema, {})),
  doNotDisturb: bool(false),
  autoUpdate: bool(true),
  shortcuts: v.fallback(ShortcutsSchema, v.parse(ShortcutsSchema, {})),
  exportPrefs: ExportPrefsSchema,
  // Saved ids of the form `cb_` plus 8 hex digits name voices that no longer exist; they become the default voice.
  voice: v.fallback(v.pipe(v.string(), v.minLength(1), v.maxLength(64), v.regex(/^(?!cb_[0-9a-f]{8}$)/)), DEFAULT_VOICE),
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
    idleUnload: v.picklist(IDLE_CHOICES),
    loadAtStart: v.boolean(),
    batterySaver: v.boolean(),
    notifications: NotificationsSchema,
    doNotDisturb: v.boolean(),
    autoUpdate: v.boolean(),
    exportPrefs: ExportPrefsSchema,
    voice: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
    speed: v.pipe(v.number(), v.minValue(0.5), v.maxValue(3)),
  }),
);
export type ConfigPatch = v.InferOutput<typeof ConfigPatchSchema>;

const ShortcutIdSchema = v.picklist(SHORTCUT_IDS);
const ReaderCommandSchema = v.variant("type", [
  v.object({ type: v.picklist(["toggle", "pause", "resume", "stop", "replay"]) }),
  v.object({ type: v.literal("step"), by: v.picklist([-1, 1]) }),
  v.object({ type: v.literal("skip"), ms: v.picklist([-10_000, 10_000]) }),
  v.object({ type: v.literal("keep-on-top"), on: v.boolean() }),
]);
const ExportOptionsSchema = v.object({
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(200_000)),
  voice: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  speed: v.pipe(v.number(), v.minValue(0.5), v.maxValue(3)),
  format: v.picklist(EXPORT_FORMATS),
  mp3Kbps: v.picklist(MP3_KBPS),
  dir: v.pipe(v.string(), v.maxLength(1024)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  conflict: v.optional(v.picklist(["replace", "keep-both"])),
});

const EXTERNAL_LINKS = ["webstore"] as const;
const OPEN_PATHS = ["models", "logs"] as const;

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
  preview: v.tuple([v.pipe(v.string(), v.minLength(1), v.maxLength(64)), v.pipe(v.string(), v.minLength(1), v.maxLength(5000)), v.optional(v.pipe(v.number(), v.minValue(0.5), v.maxValue(3)))]),
  copy: v.tuple([v.pipe(v.string(), v.maxLength(10_000))]),
  openExternal: v.tuple([v.picklist(EXTERNAL_LINKS)]),
  openPath: v.tuple([v.picklist(OPEN_PATHS)]),
  storage: v.tuple([]),
  deleteDownloads: v.tuple([]),
  metrics: v.tuple([]),
  hideWindow: v.tuple([]),
  quit: v.tuple([]),
  setShortcut: v.tuple([ShortcutIdSchema, v.pipe(v.string(), v.maxLength(64))]),
  resetShortcuts: v.tuple([]),
  reader: v.tuple([ReaderCommandSchema]),
  readerStarted: v.tuple([v.pipe(v.number(), v.integer()), v.pipe(v.number(), v.integer())]),
  readerDone: v.tuple([v.pipe(v.number(), v.integer()), v.pipe(v.number(), v.integer())]),
  warmEngine: v.tuple([]),
  engines: v.tuple([]),
  updateAction: v.tuple([v.picklist(UPDATE_ACTIONS)]),
  exportCheck: v.tuple([v.pipe(v.string(), v.maxLength(1024)), v.pipe(v.string(), v.maxLength(120)), v.picklist(EXPORT_FORMATS)]),
  exportStart: v.tuple([ExportOptionsSchema]),
  exportCancel: v.tuple([v.pipe(v.string(), v.maxLength(64))]),
  exportReveal: v.tuple([v.pipe(v.string(), v.maxLength(1024)), v.boolean()]),
  pickFolder: v.tuple([v.pipe(v.string(), v.maxLength(1024))]),
  installExtension: v.tuple([]),
} as const;
