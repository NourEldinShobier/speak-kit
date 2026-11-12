import * as v from "valibot";
import { DEFAULT_PORT, DEFAULT_VOICE, DEFAULT_VOICE_CHAT_VOICE, VOICE_CHAT_VOICES } from "@speakkit/protocol";
import { normalizeApiKey } from "./voice-chat";
import { UPDATE_ACTIONS } from "./updates";
import { DictationConfigSchema } from "./dictation/settings";
import { CaptureConfigSchema } from "./capture/settings";
import { TranscriptsConfigSchema } from "./transcripts/settings";
import { EnginesConfigSchema } from "./speech-models/config";
import { DEFAULT_SHORTCUTS, SHORTCUT_IDS, checkAccelerator, normalize } from "./shortcuts";

/** Idle-unload choices shown in Settings > Memory; the value is what is stored. */
export const IDLE_CHOICES = ["1", "5", "15", "never"] as const;
export type IdleChoice = (typeof IDLE_CHOICES)[number];

const UNWRAPPED = new WeakMap<object, v.GenericSchema>();
/** v.fallback that remembers the schema it wraps, so the settings loader can tell which stored fields were invalid. */
function fb<const S extends v.GenericSchema, const F extends v.Fallback<S>>(schema: S, d: F) {
  const wrapped = v.fallback(schema, d);
  UNWRAPPED.set(wrapped, schema);
  return wrapped;
}
export const unwrappedField = (field: object): v.GenericSchema => UNWRAPPED.get(field) ?? (field as v.GenericSchema);

const bool = (d: boolean) => fb(v.boolean(), d);

/** Events in Settings > Notifications; each can show a Windows toast, a line in the bell, and play a sound. */
export const NOTIFY_EVENTS = ["reading-finished", "export-done", "engine-error", "update-ready"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];
export const NOTIFY_CHANNELS = ["toast", "bell", "sound"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];
const channelsOf = (toast: boolean, bell: boolean, sound: boolean) => fb(v.object({ toast: bool(toast), bell: bool(bell), sound: bool(sound) }), { toast, bell, sound });
const NotificationsSchema = v.object({
  "reading-finished": channelsOf(false, false, false),
  "export-done": channelsOf(true, true, false),
  "engine-error": channelsOf(true, true, true),
  "update-ready": channelsOf(true, true, false),
});
export type Notifications = v.InferOutput<typeof NotificationsSchema>;

const accelerator = (id: (typeof SHORTCUT_IDS)[number]) =>
  fb(
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
const ExportPrefsSchema = fb(
  v.object({
    format: fb(v.picklist(EXPORT_FORMATS), "mp3"),
    mp3Kbps: fb(v.picklist(MP3_KBPS), 192),
    folder: fb(v.pipe(v.string(), v.maxLength(1024)), ""),
    captions: fb(v.picklist(["none", "srt", "vtt"]), "none"),
    chapters: fb(v.boolean(), false),
  }),
  { format: "mp3", mp3Kbps: 192, folder: "", captions: "none", chapters: false },
);
export type ExportPrefs = v.InferOutput<typeof ExportPrefsSchema>;

export const APPEARANCES = ["system", "light"] as const;
export const CLOSE_ACTIONS = ["hide", "quit"] as const;
export const MOTION_CHOICES = ["system", "on", "off"] as const;
export const UPDATE_CHANNELS = ["stable", "early"] as const;

const port = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(65535));

/** Persisted config (userData/config.json). Every field falls back to its default so a hand-edited or old file never breaks startup. */
export const ConfigSchema = v.object({
  setupDone: bool(false),
  setupSkipped: bool(false),
  /** The setup step the person was on when the window closed, so setup resumes there. */
  setupStep: fb(v.picklist([0, 1, 2, 3, 4]), 0),
  preferredPort: fb(port, DEFAULT_PORT),
  startMinimized: bool(false),
  language: fb(v.picklist(["system", "en"]), "system"),
  appearance: fb(v.picklist(APPEARANCES), "system"),
  closeAction: fb(v.picklist(CLOSE_ACTIONS), "hide"),
  hideTrayIcon: bool(false),
  reduceMotion: fb(v.picklist(MOTION_CHOICES), "system"),
  updateChannel: fb(v.picklist(UPDATE_CHANNELS), "stable"),
  experiments: fb(v.record(v.pipe(v.string(), v.maxLength(64)), v.boolean()), {}),
  appliedMigrations: fb(v.array(v.pipe(v.string(), v.maxLength(64))), []),
  configVersion: fb(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  idleUnload: fb(v.picklist(IDLE_CHOICES), "5"),
  loadAtStart: bool(false),
  batterySaver: bool(true),
  notifications: fb(NotificationsSchema, v.parse(NotificationsSchema, {})),
  doNotDisturb: bool(false),
  autoUpdate: bool(true),
  /** The local control server for the command line and the MCP server. */
  controlServer: bool(true),
  shortcuts: fb(ShortcutsSchema, v.parse(ShortcutsSchema, {})),
  exportPrefs: ExportPrefsSchema,
  // Saved ids of the form `cb_` plus 8 hex digits name voices that no longer exist; they become the default voice.
  voice: fb(v.pipe(v.string(), v.minLength(1), v.maxLength(64), v.regex(/^(?!cb_[0-9a-f]{8}$)/)), DEFAULT_VOICE),
  speed: fb(v.pipe(v.number(), v.minValue(0.5), v.maxValue(3)), 1),
  voiceChatVoice: fb(v.picklist(VOICE_CHAT_VOICES), DEFAULT_VOICE_CHAT_VOICE),
  dictation: fb(DictationConfigSchema, v.parse(DictationConfigSchema, {})),
  capture: fb(CaptureConfigSchema, v.parse(CaptureConfigSchema, {})),
  transcripts: fb(TranscriptsConfigSchema, v.parse(TranscriptsConfigSchema, {})),
  engines: fb(EnginesConfigSchema, v.parse(EnginesConfigSchema, {})),
});
export type Config = v.InferOutput<typeof ConfigSchema>;

/** Parse whatever is on disk into a full Config; bad or missing fields take their defaults. */
export const parseConfig = (raw: unknown): Config => v.parse(ConfigSchema, raw && typeof raw === "object" ? raw : {});

/** The renderer may change these keys only. */
export const ConfigPatchSchema = v.partial(
  v.strictObject({
    setupDone: v.boolean(),
    setupSkipped: v.boolean(),
    setupStep: v.picklist([0, 1, 2, 3, 4]),
    startMinimized: v.boolean(),
    language: v.picklist(["system", "en"]),
    appearance: v.picklist(APPEARANCES),
    closeAction: v.picklist(CLOSE_ACTIONS),
    hideTrayIcon: v.boolean(),
    reduceMotion: v.picklist(MOTION_CHOICES),
    updateChannel: v.picklist(UPDATE_CHANNELS),
    experiments: v.record(v.pipe(v.string(), v.maxLength(64)), v.boolean()),
    idleUnload: v.picklist(IDLE_CHOICES),
    loadAtStart: v.boolean(),
    batterySaver: v.boolean(),
    notifications: NotificationsSchema,
    doNotDisturb: v.boolean(),
    autoUpdate: v.boolean(),
    controlServer: v.boolean(),
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
  captions: v.optional(v.picklist(["none", "srt", "vtt"])),
  chapters: v.optional(v.boolean()),
});

const EXTERNAL_LINKS = ["webstore", "release-notes", "issues", "security"] as const;
const OPEN_PATHS = ["models", "logs", "data"] as const;

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
  voiceChatStatus: v.tuple([]),
  // The key is trimmed and checked for its shape here; a call with anything else is refused before a handler runs, and the error never repeats it.
  voiceChatSetKey: v.tuple([
    v.pipe(
      v.string(),
      v.maxLength(1000),
      v.trim(),
      v.check((k) => normalizeApiKey(k) !== null),
    ),
  ]),
  voiceChatRemoveKey: v.tuple([]),
  voiceChatTestKey: v.tuple([]),
  voiceChatSetVoice: v.tuple([v.picklist(VOICE_CHAT_VOICES)]),
  diagnosticsLog: v.tuple([v.pipe(v.number(), v.integer(), v.minValue(0))]),
  diagnosticsReport: v.tuple([]),
  clearActivity: v.tuple([]),
  dismissSettingsNotice: v.tuple([]),
  micAccess: v.tuple([]),
  openSystemSettings: v.tuple([v.literal("microphone")]),
  restartApp: v.tuple([]),
} as const;
