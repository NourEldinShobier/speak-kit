import type { Notice } from "../../../shared/capture/notices";
import { noticeFor } from "../../../shared/capture/notices";
import { REPLAY } from "../../../shared/capture/replay";
import type { CaptureConfig } from "../../../shared/capture/settings";
import { videoName, type Bundle } from "../bundle";
import { MAX_SIDE_PX, pickKeyframes, type Frame } from "../keyframes";
import type { CapturePlatform } from "../platform/types";
import type { RecorderHost } from "../recorder-host";
import type { CaptureRecord, CaptureStore } from "../store";

const FRAME_EVERY_MS = 1000;
const START_TIMEOUT_MS = 15_000;
const SAVE_TIMEOUT_MS = 60_000;

/** Whether the replay buffer should be running: it needs capture on, the experiment, the person's choice and their having read what it does. */
export const replayWanted = (c: Pick<CaptureConfig, "enabled" | "experiments" | "replayBuffer" | "replayConsented">, supported: boolean): boolean =>
  supported && c.enabled && c.experiments.replay && c.replayBuffer && c.replayConsented;

export interface ReplayDeps {
  host(): RecorderHost;
  bundle(): Bundle;
  store(): CaptureStore;
  platform: CapturePlatform;
  /** Keeps this app's own windows out of the recording. */
  hideOwnWindows(on: boolean): void;
  /** Makes the contact sheet of these pictures of the capture; undefined when it could not be made. */
  sheet(id: string, files: readonly string[]): Promise<Buffer | undefined>;
  /** The capture is saved: copy its sheet and show it. */
  saved(record: CaptureRecord, sheet: Buffer | undefined): void;
  notify(n: Notice): void;
  /** The state (on, saving) changed. */
  changed(): void;
  now(): number;
  newId(): string;
  log(line: string): void;
}

export interface Replay {
  readonly on: boolean;
  readonly saving: boolean;
  /** Starts keeping the screen of the first display, where the indicator is. False when it could not start. */
  arm(): Promise<boolean>;
  /** Starts again on the first display. With `onlyIfMoved` it does nothing while that is still the display being kept. */
  rearm(onlyIfMoved?: boolean): Promise<boolean>;
  /** Stops keeping it and drops what was kept. */
  disarm(): Promise<void>;
  /** Saves the last 15 seconds as a capture; undefined when nothing could be saved. */
  save(): Promise<CaptureRecord | undefined>;
}

type Clip = NonNullable<Extract<Awaited<ReturnType<RecorderHost["call"]>>, { ok: true }>["clip"]>;

/** Saves a clip as a capture: the video pieces, the pictures, the contact sheet and the list entry. */
async function writeReplay(d: ReplayDeps, clip: Clip, title: string): Promise<CaptureRecord> {
  const id = d.newId();
  const bundle = d.bundle();
  await bundle.open(id);
  for (const [i, video] of clip.videos.entries()) await bundle.video(id, i + 1, video);
  const frames: Frame[] = [];
  for (const f of clip.frames) frames.push(await bundle.frame(id, f.atMs, f.jpeg));
  const plan = pickKeyframes(frames, []);
  const sheet = await d.sheet(
    id,
    plan.frames.map((f) => f.file),
  );
  const record: CaptureRecord = {
    id,
    kind: "recording",
    title,
    at: d.now(),
    dir: id,
    durationMs: clip.durationMs,
    bytes: await bundle.bytes(id),
    media: videoName(1),
    frames: plan.frames.map((f) => f.file),
    ...(sheet && { sheet: "sheet.jpg" }),
    chips: ["saved", "copied"],
  };
  await d.store().add(record);
  d.saved(record, sheet);
  return record;
}

/** Says why the buffer could not start, with the notice that fits; always false. */
function failed(d: ReplayDeps, why: string, notice: Notice = noticeFor("failed")): false {
  d.log(`capture replay: ${why}`);
  d.notify(notice);
  return false;
}

/** Starts the recorder on the first display (the capsule is there too, so the indicator is where the recording is); the title of the capture, or false. */
async function startRecorder(d: ReplayDeps): Promise<{ title: string; displayId: string } | false> {
  const display = d.platform.displays()[0];
  const resolved = display && (await d.platform.resolve({ kind: "screen", displayId: display.id }));
  if (!resolved) return failed(d, "no picture of the screen");
  d.hideOwnWindows(true);
  const start = {
    op: "replay-start",
    sourceId: resolved.sourceId,
    ...(resolved.crop && { crop: resolved.crop }),
    frameEveryMs: FRAME_EVERY_MS,
    maxSide: MAX_SIDE_PX,
    segmentMs: REPLAY.segmentMs,
  } as const;
  const r = await d.host().call(start, START_TIMEOUT_MS);
  if (r.ok) return { title: `Replay · ${resolved.title}`, displayId: display.id };
  d.hideOwnWindows(false);
  return failed(d, `the recorder could not start (${r.code})`, noticeFor(r.code === "denied" ? "permission-denied" : "failed", { os: d.platform.os }));
}

/** Asks the recorder for the last 15 seconds and saves them as a capture; undefined (with a notice) when that did not work. */
async function saveClip(d: ReplayDeps, title: string): Promise<CaptureRecord | undefined> {
  try {
    const r = await d.host().call({ op: "replay-save" }, SAVE_TIMEOUT_MS);
    if (r.ok && r.clip?.videos.length) return await writeReplay(d, r.clip, title);
    d.notify(noticeFor("nothing-recorded"));
  } catch (e) {
    failed(d, `the replay could not be saved (${String(e)})`);
  }
  return undefined;
}

/**
 * The replay buffer: while it is on, the recorder window keeps the last 15 seconds of one screen in memory. Nothing reaches the disk until a replay is
 * saved, and that is a capture like any other (video pieces, pictures, contact sheet) in the list.
 */
export function createReplay(d: ReplayDeps): Replay {
  let on = false;
  let saving = false;
  let title = "Replay";
  let displayId: string | undefined;
  const set = (patch: { on?: boolean; saving?: boolean }) => {
    on = patch.on ?? on;
    saving = patch.saving ?? saving;
    d.changed();
  };

  return {
    get on() {
      return on;
    },
    get saving() {
      return saving;
    },
    async arm() {
      if (on) return true;
      const started = await startRecorder(d);
      if (started === false) return false;
      ({ title, displayId } = started);
      set({ on: true });
      return true;
    },
    async rearm(onlyIfMoved) {
      if (!on || (onlyIfMoved && d.platform.displays()[0]?.id === displayId)) return on;
      await this.disarm();
      return this.arm();
    },
    async disarm() {
      if (!on) return;
      await d.host().call({ op: "replay-stop" });
      d.hideOwnWindows(false);
      set({ on: false, saving: false });
    },
    async save() {
      if (!on || saving) return undefined;
      set({ saving: true });
      try {
        return await saveClip(d, title);
      } finally {
        set({ saving: false });
      }
    },
  };
}
