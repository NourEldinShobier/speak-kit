import * as v from "valibot";
import type { CapsuleState } from "./capsule";
import type { CAPTURE_METHODS } from "./channels";
import type { Notice, NoticeAction } from "./notices";
import { CapturePatchSchema, type CaptureConfig, type CapturePatch } from "./settings";

export type { CaptureMethod } from "./channels";

export type CapturePhase = "idle" | "picking" | "recording" | "finishing";

/** Outcome of the start-up recovery of interrupted captures. */
export interface RecoveryView {
  finished: number;
  removed: number;
}

export interface CaptureStatus {
  /** False where capture is not built (Linux). */
  supported: boolean;
  platform: string;
  enabled: boolean;
  hotkeyReady: boolean;
  hotkeyFailed?: boolean;
  phase: CapturePhase;
  /** macOS Screen Recording permission; "not-needed" elsewhere. */
  permission: "granted" | "denied" | "not-determined" | "not-needed";
  settings: CaptureConfig;
  /** Folder captures are saved in. */
  folder: string;
  count: number;
  notice?: Notice;
  recovery?: RecoveryView;
  /** The microphone and speech model can make words. */
  narrationReady: boolean;
  capsule?: CapsuleState;
}

export interface CaptureItem {
  id: string;
  kind: "recording" | "screenshot";
  title: string;
  at: number;
  durationMs?: number;
  wordCount: number;
  bytes: number;
  chips: ("copied" | "saved" | "sent")[];
  finishing: boolean;
  /** data: URL of a small thumbnail, or undefined. */
  thumb?: string;
}

export interface CaptureDetail extends CaptureItem {
  words: { text: string; startMs: number; endMs: number }[];
  frames: { atMs: number; src: string }[];
  path: string;
}

export type CopyWhat = "picture" | "text" | "path";

/** The only surface the capture pages get (window.speakkitCapture). */
export interface CaptureBridge {
  status(): Promise<CaptureStatus>;
  setEnabled(on: boolean): Promise<CaptureStatus>;
  patchSettings(patch: CapturePatch): Promise<CaptureStatus>;
  list(search: string): Promise<{ items: CaptureItem[]; total: number }>;
  detail(id: string): Promise<CaptureDetail | null>;
  copy(id: string, what: CopyWhat): Promise<boolean>;
  reveal(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  start(): Promise<CaptureStatus>;
  stop(): Promise<CaptureStatus>;
  discard(): Promise<CaptureStatus>;
  noticeAction(action: NoticeAction): Promise<CaptureStatus>;
  dismissNotice(): Promise<CaptureStatus>;
  dismissRecovery(): Promise<CaptureStatus>;
  chooseFolder(): Promise<CaptureStatus>;
  onStatus(cb: (s: CaptureStatus) => void): () => void;
}

const id = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/));
const NOTICE_ACTIONS = ["retry", "ok", "open-audio", "choose-folder", "open-trash", "record-screen", "open-permissions", "open-settings"] as const satisfies readonly NoticeAction[];

export const CAPTURE_ARGS = {
  status: v.tuple([]),
  setEnabled: v.tuple([v.boolean()]),
  patchSettings: v.tuple([CapturePatchSchema]),
  list: v.tuple([v.pipe(v.string(), v.maxLength(200))]),
  detail: v.tuple([id]),
  copy: v.tuple([id, v.picklist(["picture", "text", "path"])]),
  reveal: v.tuple([id]),
  remove: v.tuple([id]),
  start: v.tuple([]),
  stop: v.tuple([]),
  discard: v.tuple([]),
  noticeAction: v.tuple([v.picklist(NOTICE_ACTIONS)]),
  dismissNotice: v.tuple([]),
  dismissRecovery: v.tuple([]),
  chooseFolder: v.tuple([]),
} as const satisfies Record<(typeof CAPTURE_METHODS)[number], v.GenericSchema<unknown[]>>;

/** What the picker overlay draws. Rectangles are in device-independent pixels of the overlay's display. */
export interface OverlayView {
  mode: "screen" | "window" | "area";
  display: { id: string; name: string; width: number; height: number; scaleFactor: number };
  windows: { id: string; title: string; x: number; y: number; width: number; height: number }[];
  /** Why the picker is open: a first capture, or a switch while recording. */
  switching: boolean;
}

export const OverlayResultSchema = v.nullable(
  v.variant("kind", [
    v.object({ kind: v.literal("screen") }),
    v.object({ kind: v.literal("window"), windowId: v.pipe(v.string(), v.maxLength(100)) }),
    v.object({ kind: v.literal("area"), x: v.number(), y: v.number(), width: v.number(), height: v.number() }),
  ]),
);
export type OverlayResult = v.InferOutput<typeof OverlayResultSchema>;

export const CapsuleActionSchema = v.picklist(["pen", "stop", "discard", "discard-keep", "discard-confirm", "open", "send", "hold", "undo", "send-now", "retry", "dismiss", "switch"]);
export type CapsuleAction = v.InferOutput<typeof CapsuleActionSchema>;

type Crop = { x: number; y: number; width: number; height: number };

/** Commands to the hidden recorder window. */
export type RecorderCommand =
  | { id: number; op: "start"; sourceId: string; crop?: Crop; narration: boolean; frameEveryMs: number; maxSide: number }
  | { id: number; op: "switch"; sourceId: string; crop?: Crop }
  | { id: number; op: "stop" }
  | { id: number; op: "abort" };

export type RecorderResult =
  | { ok: true; micOk?: boolean; durationMs?: number; softwareEncoder?: boolean; frames?: number; width?: number; height?: number }
  | { ok: false; code: "source" | "encoder" | "denied" };

/** What the recorder streams to main while it runs, so nothing waits in memory and a crash loses at most a second. */
export type RecorderData = { kind: "frame"; atMs: number; jpeg: Uint8Array } | { kind: "video"; chunk: Uint8Array } | { kind: "audio"; chunk: Int16Array };
