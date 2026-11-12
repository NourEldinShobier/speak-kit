import * as v from "valibot";
import type { CapsuleState } from "./capsule";
import type { CAPTURE_METHODS } from "./channels";
import type { Notice, NoticeAction } from "./notices";
import { ZoomRegionsSchema, type FrameRect, type ZoomRegion } from "./zoom";
import { CapturePatchSchema, type CaptureConfig, type CapturePatch } from "./settings";

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
  /** Why the hotkey the person chose was not taken (it belongs to Dictation). */
  hotkeyNote?: string;
  /** The first capture needs the person to read and accept what is recorded. */
  consentRequired?: boolean;
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
  /** `file` names the picture for editing; `edited` is true when the picture shown is an edited copy. */
  frames: { atMs: number; src: string; file: string; edited: boolean }[];
  path: string;
  /** The video can be cut (a recording with one video file); `trim` is the range kept now. */
  trimmable: boolean;
  trim?: { startMs: number; endMs: number };
  /** The video can be shown closer in parts (a recording with one video file). */
  zoomable: boolean;
  /** The zooms in the video shown now, and the contact sheet of them (a data: URL). */
  zoom?: ZoomRegion[];
  zoomSheet?: string;
}

export interface EditSource {
  src: string;
  width: number;
  height: number;
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
  /** A picture of a capture at full size, to edit: the screenshot, or one of the frames. Null when it is not there or cannot be edited. */
  source(id: string, file: string): Promise<EditSource | null>;
  /** Saves an edited copy of a picture (PNG); the original stays. */
  saveEdit(id: string, file: string, png: Uint8Array): Promise<boolean>;
  /** Cuts the video of a recording to this range (milliseconds from its start); false when it cannot be cut. The original video stays. */
  trim(id: string, startMs: number, endMs: number): Promise<boolean>;
  /** Makes the video show these parts closer (none: the video as it was); false when it cannot be done. The original video stays. */
  zoom(id: string, regions: ZoomRegion[]): Promise<boolean>;
  /** Zooms chosen from where you clicked, where the pointer rested and where the pen drew; empty when nothing was noted. */
  suggestZoom(id: string): Promise<ZoomRegion[]>;
  onStatus(cb: (s: CaptureStatus) => void): () => void;
}

/** Largest edited picture main accepts. */
export const MAX_EDIT_BYTES = 80_000_000;
/** The shortest piece a trim keeps. */
export const MIN_TRIM_MS = 500;
/** Longest recording a trim is asked for (24 hours). */
export const MAX_TRIM_MS = 86_400_000;
/** A file of a capture: in the folder, or a frame of a recording in its frames folder. Whether it is one the capture has is checked by main. */
const fileName = v.pipe(v.string(), v.regex(/^(frames[\\/])?[A-Za-z0-9_.-]{1,80}$/));
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
  source: v.tuple([id, fileName]),
  saveEdit: v.tuple([
    id,
    fileName,
    v.pipe(
      v.instance(Uint8Array),
      v.check((b) => b.byteLength <= MAX_EDIT_BYTES),
    ),
  ]),
  trim: v.tuple([id, v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_TRIM_MS)), v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_TRIM_MS))]),
  zoom: v.tuple([id, ZoomRegionsSchema]),
  suggestZoom: v.tuple([id]),
} as const satisfies Record<(typeof CAPTURE_METHODS)[number], v.GenericSchema<unknown[]>>;

/** What the picker overlay draws. Rectangles are in device-independent pixels of the overlay's display. */
export interface OverlayView {
  mode: "screen" | "window" | "area" | "ink";
  /** Ink mode: how long a stroke stays, 0 for until cleared; whether the pointer leaves a glowing trail. */
  inkFadeMs?: number;
  trail?: boolean;
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

export const CapsuleActionSchema = v.picklist([
  "pen",
  "stop",
  "discard",
  "discard-keep",
  "discard-confirm",
  "open",
  "send",
  "hold",
  "undo",
  "send-now",
  "retry",
  "dismiss",
  "switch",
  "copy-again",
  "copy-path",
  "replay-save",
  "replay-off",
]);
export type CapsuleAction = v.InferOutput<typeof CapsuleActionSchema>;

type Crop = { x: number; y: number; width: number; height: number };

/** Commands to the hidden recorder window. */
export type RecorderCommand =
  | { id: number; op: "start"; gen: number; sourceId: string; crop?: Crop; narration: boolean; frameEveryMs: number; maxSide: number }
  | { id: number; op: "switch"; sourceId: string; crop?: Crop }
  | { id: number; op: "stop" }
  | { id: number; op: "abort" }
  | {
      id: number;
      op: "sheet";
      jpegs: Uint8Array[];
      columns: number;
      cellWidth: number;
      cellHeight: number;
      /** The part of each picture to show (fractions), for the zoom contact sheet. */ crops?: FrameRect[];
    }
  | { id: number; op: "zoom"; video: Uint8Array; regions: ZoomRegion[] }
  /** The replay buffer: the screen is kept in short pieces in the recorder window, the oldest dropped. Nothing is streamed to main until it is saved. */
  | { id: number; op: "replay-start"; sourceId: string; crop?: Crop; frameEveryMs: number; maxSide: number; segmentMs: number }
  | { id: number; op: "replay-save" }
  | { id: number; op: "replay-stop" }
  | { id: number; op: "trim"; video: Uint8Array; startMs: number; endMs: number };

export type RecorderResult =
  | {
      ok: true;
      micOk?: boolean | undefined;
      durationMs?: number | undefined;
      softwareEncoder?: boolean | undefined;
      frames?: number | undefined;
      width?: number | undefined;
      height?: number | undefined;
      jpeg?: Uint8Array | undefined;
      /** A trimmed video. */
      video?: Uint8Array | undefined;
      segments?: number | undefined;
      /** A saved replay: the video pieces in order, and the pictures with their times from the start of the clip. */
      clip?: { videos: Uint8Array[]; frames: { atMs: number; jpeg: Uint8Array }[]; durationMs: number } | undefined;
    }
  | { ok: false; code: "source" | "encoder" | "denied" };

/** What the recorder streams to main while it runs, so nothing waits in memory and a crash loses at most a second. */
export type RecorderPayload =
  | { kind: "frame"; atMs: number; jpeg: Uint8Array }
  | { kind: "video"; segment: number; chunk: Uint8Array }
  | { kind: "audio"; chunk: Int16Array }
  /** The screen being recorded went away (its video track ended). */
  | { kind: "lost" };
/** Each piece carries the generation of the recording it belongs to (see the fence in main). */
export type RecorderData = RecorderPayload & { gen: number };

const bytes = v.instance(Uint8Array);
const count = v.pipe(v.number(), v.finite());

export const RecorderReplySchema = v.tuple([
  v.pipe(v.number(), v.integer()),
  v.union([
    v.object({
      ok: v.literal(true),
      micOk: v.optional(v.boolean()),
      durationMs: v.optional(count),
      softwareEncoder: v.optional(v.boolean()),
      frames: v.optional(count),
      width: v.optional(count),
      height: v.optional(count),
      jpeg: v.optional(bytes),
      video: v.optional(bytes),
      segments: v.optional(count),
      clip: v.optional(v.object({ videos: v.array(bytes), frames: v.array(v.object({ atMs: count, jpeg: bytes })), durationMs: count })),
    }),
    v.object({ ok: v.literal(false), code: v.picklist(["source", "encoder", "denied"]) }),
  ]),
]);

const gen = v.pipe(v.number(), v.integer(), v.minValue(0));
export const RecorderDataSchema = v.variant("kind", [
  v.object({ gen, kind: v.literal("frame"), atMs: count, jpeg: bytes }),
  v.object({ gen, kind: v.literal("video"), segment: v.pipe(v.number(), v.integer(), v.minValue(1)), chunk: bytes }),
  v.object({ gen, kind: v.literal("audio"), chunk: v.instance(Int16Array) }),
  v.object({ gen, kind: v.literal("lost") }),
]);
