import { digitalSilence } from "../../../shared/capture/audio";
import type { RecorderCommand, RecorderPayload, RecorderResult } from "../../../shared/capture/contract";
import { MicTrack } from "./mic-track";
import { Run } from "./recorder-run";
import { trimVideo } from "./trim-video";
import { zoomVideo } from "./zoom-video";
import { joinVideos } from "./join-video";
import { createReplayBuffer, type ReplayBuffer } from "./replay-buffer";
import { inPixels } from "../../../shared/capture/zoom";

/**
 * The page of the hidden recorder window. The screen source is drawn onto a canvas (cut to the area or window, scaled to the size limit); the canvas
 * feeds a MediaRecorder for the video and a JPEG is taken from it every second. What is recorded streams to the main process as it happens. A target
 * switch ends the video segment and starts a new one; the microphone keeps running through it.
 */
const bridge = window.speakkitCapture.recorder;
const FIRST_FRAME_MS = 4000;
/** The generation of the recording in progress; the main process refuses data that carries another one. */
let gen = 0;
const send = (d: RecorderPayload) => bridge.data({ ...d, gen });

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
let run: Run | undefined;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("no frames from the source")), ms))]);

function failureCode(text: string): "encoder" | "denied" | "source" {
  if (/encoder/.test(text)) return "encoder";
  return /denied|NotAllowed/i.test(text) ? "denied" : "source";
}

async function start(c: Extract<RecorderCommand, { op: "start" }>): Promise<RecorderResult> {
  run?.stop();
  gen = c.gen;
  const r = (run = new Run(c.maxSide, send));
  try {
    await withTimeout(r.source(c.sourceId, c.crop), FIRST_FRAME_MS);
    r.startSegment(c.frameEveryMs);
  } catch (e) {
    r.stop();
    run = undefined;
    return { ok: false, code: failureCode(String(e)) };
  }
  if (c.narration) r.mic = await MicTrack.open((chunk) => send({ kind: "audio", chunk }), digitalSilence, r.startedAt);
  return { ok: true, micOk: !!r.mic };
}

async function stop(): Promise<RecorderResult> {
  const r = run;
  if (!r) return { ok: false, code: "source" };
  run = undefined;
  await r.mic?.flush();
  await r.finish();
  return { ok: true, durationMs: Math.round(performance.now() - r.startedAt), softwareEncoder: r.softwareEncoder, frames: r.frames, segments: r.segment };
}

async function swap(c: Extract<RecorderCommand, { op: "switch" }>): Promise<RecorderResult> {
  if (!run) return { ok: false, code: "source" };
  await run.endSegment();
  try {
    await run.source(c.sourceId, c.crop);
    run.startSegment(1000);
    return { ok: true };
  } catch {
    return { ok: false, code: "source" };
  }
}

async function sheet(c: Extract<RecorderCommand, { op: "sheet" }>): Promise<RecorderResult> {
  const canvas = document.createElement("canvas");
  const rows = Math.ceil(c.jpegs.length / c.columns);
  canvas.width = c.columns * c.cellWidth;
  canvas.height = rows * c.cellHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, jpeg] of c.jpegs.entries()) {
    const bmp = await createImageBitmap(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
    const at = [(i % c.columns) * c.cellWidth, Math.floor(i / c.columns) * c.cellHeight] as const;
    const part = c.crops?.[i] && inPixels(c.crops[i], bmp.width, bmp.height);
    if (part) ctx.drawImage(bmp, part.x, part.y, part.width, part.height, ...at, c.cellWidth, c.cellHeight);
    else ctx.drawImage(bmp, ...at, c.cellWidth, c.cellHeight);
    bmp.close();
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return blob ? { ok: true, jpeg: await bytes(blob) } : { ok: false, code: "encoder" };
}

async function trim(c: Extract<RecorderCommand, { op: "trim" }>): Promise<RecorderResult> {
  const video = await trimVideo(c.video, c.startMs, c.endMs);
  return video.length ? { ok: true, video, durationMs: c.endMs - c.startMs } : { ok: false, code: "encoder" };
}

let replay: ReplayBuffer | undefined;

async function replayStart(c: Extract<RecorderCommand, { op: "replay-start" }>): Promise<RecorderResult> {
  replay?.stop();
  const buffer = (replay = createReplayBuffer({ now: () => performance.now(), segmentMs: c.segmentMs }));
  // the buffer keeps video and pictures itself; that its screen went away is for the main process
  const r = new Run(c.maxSide, (d) => (d.kind === "lost" ? send(d) : buffer.onPayload(d)));
  buffer.attach(r);
  try {
    await withTimeout(r.source(c.sourceId, c.crop), FIRST_FRAME_MS);
    buffer.start(c.frameEveryMs);
    return { ok: true };
  } catch (e) {
    r.stop();
    replay = undefined;
    return { ok: false, code: failureCode(String(e)) };
  }
}

async function replaySave(): Promise<RecorderResult> {
  const clip = await replay?.save();
  if (!clip) return { ok: false, code: "source" };
  // One file plays, trims and zooms like any recording; if the pieces cannot be joined they are kept as they are.
  const videos =
    clip.videos.length > 1
      ? await joinVideos(clip.videos).then(
          (v) => (v.length ? [v] : clip.videos),
          () => clip.videos,
        )
      : clip.videos;
  return { ok: true, clip: { ...clip, videos }, durationMs: clip.durationMs };
}

async function zoom(c: Extract<RecorderCommand, { op: "zoom" }>): Promise<RecorderResult> {
  const video = await zoomVideo(c.video, c.regions);
  return video.length ? { ok: true, video } : { ok: false, code: "encoder" };
}

bridge.onCommand((c: RecorderCommand) => {
  void (async () => {
    let result: RecorderResult = { ok: true };
    try {
      if (c.op === "start") result = await start(c);
      else if (c.op === "stop") result = await stop();
      else if (c.op === "switch") result = await swap(c);
      else if (c.op === "sheet") result = await sheet(c);
      else if (c.op === "trim") result = await trim(c);
      else if (c.op === "zoom") result = await zoom(c);
      else if (c.op === "replay-start") result = await replayStart(c);
      else if (c.op === "replay-save") result = await replaySave();
      else if (c.op === "replay-stop") {
        replay?.stop();
        replay = undefined;
      } else {
        run?.stop();
        run = undefined;
      }
    } catch {
      result = { ok: false, code: "encoder" };
    }
    bridge.reply(c.id, result);
  })();
});
bridge.ready();
