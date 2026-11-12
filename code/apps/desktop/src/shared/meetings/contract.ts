import * as v from "valibot";
import type { Detail, Failure, Outcome, Row, Since } from "@speakkit/meetings/pure";
import type { MeetingsMethod } from "./channels";
import { AddedAppSchema, CALL_POLICY_CHOICES, MeetingsPatchSchema, type MeetingsConfig, type MeetingsPatch } from "./settings";

export type { MeetingsMethod } from "./channels";

export type SystemAudio = "on" | "off" | "unavailable";

/** The recording as the window and the capsule show it. */
export interface RecordingView {
  id: string | null;
  phase: "starting" | "recording" | "saving";
  app: string;
  seconds: number;
  /** Levels 0 to 1 of the two tracks. */
  you: number;
  them: number;
  /** The microphone has given nothing while the other side speaks. */
  micSilent: boolean;
  system: SystemAudio;
  /** One line about the recording that the person should read (system audio missing, microphone changed). */
  note?: string;
}

export interface Push {
  recording: RecordingView | null;
  /** Changes with every change to the meetings, so a window knows to fetch again. */
  tick: number;
  /** A notice about a meeting that went wrong; shown until closed. */
  notice?: string;
}

export interface Device {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface ProviderView {
  id: string;
  name: string;
  mark: string;
  userAdded: boolean;
  /** "In Chrome, Edge and other browsers" for apps that live in a tab. */
  hint?: string;
  policy: (typeof CALL_POLICY_CHOICES)[number];
}

/** What this system can do for call recording, and what it cannot yet (named, so the page can say so). */
export interface Capabilities {
  platform: "win32" | "darwin" | "other";
  /** Whether the system's own sound can be recorded. */
  systemAudio: "available" | "unavailable";
  /** Whether the program using the microphone can be told from the OS. */
  callDetection: "available" | "unavailable";
  /** Whether the OS names the microphone a call app has open (per process); when not, the saved microphone is used. */
  micFollowsCallApp: "available" | "unavailable";
  /** Whether the output the call app plays on can be named; when not, the default output is recorded. */
  callAppOutput: "available" | "unavailable";
}

export interface SettingsView {
  config: MeetingsConfig;
  providers: ProviderView[];
  /** Where files go, after the default is applied. */
  folder: string;
  storage: { audioBytes: number; count: number };
  /** The manifest was written by a newer version (nothing can be changed) or could not be read (it was set aside). */
  notice: { newer: boolean; recoveredFrom?: string };
  capabilities: Capabilities;
  /** The call app found right now and where it plays; null when none. */
  callApp: { name: string } | null;
  /** The summary needs an OpenAI key: whether one is saved. */
  keySaved: boolean;
  /** Settings values that were not usable and fell back to their default. */
  invalid: string[];
}

export type AddAppResult = { ok: true; view: SettingsView } | { ok: false; field: "name" | "app" | "link"; message: string };

export interface MeetingsBridge {
  list(q?: { search?: string; trashed?: boolean }): Promise<Row[]>;
  get(id: string): Promise<Detail | null>;
  rename(id: string, title: string): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  retry(id: string): Promise<Outcome>;
  regenerateNotes(id: string): Promise<Outcome>;
  applyVocabulary(id: string): Promise<Outcome<{ changed: number }>>;
  /** The lines not copied yet, on the clipboard; false when there is nothing new. */
  copyNew(id: string): Promise<boolean>;
  copyText(id: string, part?: { from: number; to: number }): Promise<boolean>;
  /** Writes the transcript and notes as files; returns the paths. */
  writeFiles(id: string): Promise<Outcome<{ paths: string[] }>>;
  reveal(id: string): Promise<boolean>;
  /** Starts a recording by hand (the shortcut, or Record on a call). */
  start(): Promise<Outcome<{ id: string }>>;
  stop(): Promise<Outcome<{ id: string }>>;
  settings(): Promise<SettingsView>;
  patchSettings(patch: MeetingsPatch): Promise<SettingsView>;
  setPolicy(providerId: string, policy: (typeof CALL_POLICY_CHOICES)[number]): Promise<SettingsView>;
  addApp(app: { name: string; exe?: string; link?: string }): Promise<AddAppResult>;
  removeApp(providerId: string): Promise<SettingsView>;
  chooseFolder(): Promise<SettingsView | null>;
  openFolder(): Promise<void>;
  /** Microphones and outputs, for the pickers. */
  devices(): Promise<{ inputs: Device[]; outputs: Device[] }>;
  push(): Promise<Push>;
  onPush(cb: (p: Push) => void): () => void;
  /** Events after `seq` that a consumer may have missed. */
  since(seq: number): Promise<Since>;
  ack(consumer: string, seq: number): Promise<void>;
  rec: {
    onCommand(cb: (c: RecCommand) => void): () => void;
    reply(id: number, r: RecResult): void;
    chunk(track: "you" | "them", pcm: Int16Array, atSec: number): void;
    level(track: "you" | "them", n: number): void;
    ended(track: "you" | "them"): void;
    ready(): void;
  };
  capsule: {
    onState(cb: (s: CapsuleView | null) => void): () => void;
    act(a: CapsuleAction): void;
    /** The pointer is over the pill (clicks go to it) or left it (clicks pass through to what is below). */
    interactive(on: boolean): void;
    /** The pill is being dragged by this much. `end` saves where it landed. */
    drag(dx: number, dy: number, end: boolean): void;
    ready(): void;
  };
}

export type RecCommand = { id: number; op: "start"; micDevice: string; system: boolean } | { id: number; op: "stop" } | { id: number; op: "reopen-system" } | { id: number; op: "devices" };
export type RecResult = { ok: true; system?: SystemAudio; devices?: { inputs: Device[]; outputs: Device[] } } | { ok: false; code: "mic-denied" | "mic-missing" | "mic-busy" | "mic-failed" };

export type CapsuleView =
  | { kind: "offer"; sessionId: string; app: string; mark: string }
  | { kind: "recording"; app: string; seconds: number; you: number; them: number; micSilent: boolean; system: SystemAudio; note?: string }
  | { kind: "ending"; sessionId: string; app: string; secondsLeft: number | null }
  | { kind: "saved"; id: string; title: string; mark: string }
  | { kind: "notice"; text: string };

export type CapsuleAction =
  | { type: "record"; sessionId: string }
  | { type: "dismiss"; sessionId: string; how: "close" | "this-call" | "never" }
  | { type: "stop" }
  | { type: "keep" }
  | { type: "close" }
  | { type: "show-folder"; id: string }
  | { type: "open"; id: string };

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

export const MEETINGS_ARGS = {
  list: v.tuple([v.optional(v.object({ search: v.optional(v.pipe(v.string(), v.maxLength(200))), trashed: v.optional(v.boolean()) }))]),
  get: v.tuple([id]),
  rename: v.tuple([id, v.pipe(v.string(), v.maxLength(400))]),
  trash: v.tuple([id]),
  restore: v.tuple([id]),
  remove: v.tuple([id]),
  retry: v.tuple([id]),
  regenerateNotes: v.tuple([id]),
  applyVocabulary: v.tuple([id]),
  copyNew: v.tuple([id]),
  copyText: v.tuple([id, v.optional(v.object({ from: v.pipe(v.number(), v.finite(), v.minValue(0)), to: v.pipe(v.number(), v.finite(), v.minValue(0)) }))]),
  writeFiles: v.tuple([id]),
  reveal: v.tuple([id]),
  start: v.tuple([]),
  stop: v.tuple([]),
  settings: v.tuple([]),
  patchSettings: v.tuple([MeetingsPatchSchema]),
  setPolicy: v.tuple([id, v.picklist(CALL_POLICY_CHOICES)]),
  addApp: v.tuple([v.object({ name: AddedAppSchema.entries.name, exe: AddedAppSchema.entries.exe, link: AddedAppSchema.entries.link })]),
  removeApp: v.tuple([id]),
  chooseFolder: v.tuple([]),
  openFolder: v.tuple([]),
  devices: v.tuple([]),
  push: v.tuple([]),
  since: v.tuple([v.pipe(v.number(), v.integer(), v.minValue(0))]),
  ack: v.tuple([v.pipe(v.string(), v.minLength(1), v.maxLength(40)), v.pipe(v.number(), v.integer(), v.minValue(0))]),
} as const satisfies Record<MeetingsMethod, v.GenericSchema<unknown[]>>;

export const RecReplySchema = v.tuple([
  v.pipe(v.number(), v.integer()),
  v.variant("ok", [
    v.object({ ok: v.literal(true), system: v.optional(v.picklist(["on", "off", "unavailable"])), devices: v.optional(v.unknown()) }),
    v.object({ ok: v.literal(false), code: v.picklist(["mic-denied", "mic-missing", "mic-busy", "mic-failed"]) }),
  ]),
]);

export const CapsuleActionSchema = v.variant("type", [
  v.object({ type: v.literal("record"), sessionId: id }),
  v.object({ type: v.literal("dismiss"), sessionId: id, how: v.picklist(["close", "this-call", "never"]) }),
  v.object({ type: v.literal("stop") }),
  v.object({ type: v.literal("keep") }),
  v.object({ type: v.literal("close") }),
  v.object({ type: v.literal("show-folder"), id }),
  v.object({ type: v.literal("open"), id }),
]);

export type { Failure };
