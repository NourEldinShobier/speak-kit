import { digitalSilence } from "../../../shared/capture/audio";
import type { RecorderCommand, RecorderResult } from "../../../shared/capture/contract";
import { MicTrack } from "./mic-track";

/**
 * The page of the hidden recorder window. The screen source is drawn onto a canvas (cut to the area or window, scaled to the size limit); the canvas
 * feeds a MediaRecorder for the video and a JPEG is taken from it every second. What is recorded streams to the main process as it happens. A target
 * switch ends the video segment and starts a new one; the microphone keeps running through it.
 */
const bridge = window.speakkitCapture.recorder;
const MIME = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const DRAW_MS = 100;
const FIRST_FRAME_MS = 4000;

type Crop = { x: number; y: number; width: number; height: number };
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

class Run {
  readonly canvas = document.createElement("canvas");
  readonly ctx = this.canvas.getContext("2d")!;
  readonly video = document.createElement("video");
  readonly startedAt = performance.now();
  segment = 0;
  frames = 0;
  softwareEncoder = false;
  mic: MicTrack | undefined;
  #stream: MediaStream | undefined;
  #recorder: MediaRecorder | undefined;
  #draw: ReturnType<typeof setInterval> | undefined;
  #shot: ReturnType<typeof setInterval> | undefined;
  #crop: Crop | undefined;
  #maxSide: number;

  constructor(maxSide: number) {
    this.#maxSide = maxSide;
    this.video.muted = true;
  }

  async source(sourceId: string, crop: Crop | undefined): Promise<void> {
    this.#stream?.getTracks().forEach((t) => t.stop());
    // Electron takes the screen source through the legacy "mandatory" constraint; the DOM types do not know it.
    const constraints: MediaStreamConstraints = { audio: false, video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId, maxFrameRate: 15 } } as MediaTrackConstraints };
    this.#stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.#stream;
    await this.video.play();
    this.#crop = crop;
    const w = crop?.width ?? this.video.videoWidth;
    const h = crop?.height ?? this.video.videoHeight;
    if (!w || !h) throw new Error("no frames from the source");
    const k = Math.min(1, this.#maxSide / Math.max(w, h));
    this.canvas.width = Math.max(2, Math.round(w * k));
    this.canvas.height = Math.max(2, Math.round(h * k));
  }

  #paint = () => {
    const c = this.#crop;
    const v = this.video;
    if (c) this.ctx.drawImage(v, c.x, c.y, c.width, c.height, 0, 0, this.canvas.width, this.canvas.height);
    else this.ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height);
  };

  /** Starts the draw loop, the frame timer and the video of the current segment. */
  startSegment(frameEveryMs: number): void {
    this.segment++;
    this.#paint();
    this.#draw ??= setInterval(this.#paint, DRAW_MS);
    this.#shot ??= setInterval(() => void this.#takeFrame(), frameEveryMs);
    void this.#takeFrame();
    this.#startEncoder();
  }

  #startEncoder(): void {
    const stream = this.canvas.captureStream(10);
    const segment = this.segment;
    for (const [i, mimeType] of MIME.entries()) {
      if (!MediaRecorder.isTypeSupported(mimeType)) continue;
      try {
        const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
        rec.ondataavailable = (e) => e.data.size && void bytes(e.data).then((chunk) => bridge.data({ kind: "video", segment, chunk }));
        rec.start(1000);
        this.#recorder = rec;
        this.softwareEncoder ||= i > 0;
        return;
      } catch {
        // This encoder would not start (a graphics card that cannot do it): the next one, in software, is tried.
        this.softwareEncoder = true;
      }
    }
    throw new Error("encoder failed");
  }

  async #takeFrame(): Promise<void> {
    const blob = await new Promise<Blob | null>((r) => this.canvas.toBlob(r, "image/jpeg", 0.8));
    if (!blob) return;
    this.frames++;
    bridge.data({ kind: "frame", atMs: Math.round(performance.now() - this.startedAt), jpeg: await bytes(blob) });
  }

  async endSegment(): Promise<void> {
    const rec = this.#recorder;
    this.#recorder = undefined;
    if (!rec || rec.state === "inactive") return;
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
  }

  async finish(): Promise<void> {
    await this.#takeFrame();
    await this.endSegment();
    this.stop();
  }

  stop(): void {
    clearInterval(this.#draw);
    clearInterval(this.#shot);
    this.#draw = this.#shot = undefined;
    this.#stream?.getTracks().forEach((t) => t.stop());
    this.mic?.close();
    if (this.#recorder && this.#recorder.state !== "inactive") this.#recorder.stop();
  }
}

let run: Run | undefined;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("no frames from the source")), ms))]);

function failureCode(text: string): "encoder" | "denied" | "source" {
  if (/encoder/.test(text)) return "encoder";
  return /denied|NotAllowed/i.test(text) ? "denied" : "source";
}

async function start(c: Extract<RecorderCommand, { op: "start" }>): Promise<RecorderResult> {
  run?.stop();
  const r = (run = new Run(c.maxSide));
  try {
    await withTimeout(r.source(c.sourceId, c.crop), FIRST_FRAME_MS);
    r.startSegment(c.frameEveryMs);
  } catch (e) {
    r.stop();
    run = undefined;
    return { ok: false, code: failureCode(String(e)) };
  }
  if (c.narration) r.mic = await MicTrack.open((chunk) => bridge.data({ kind: "audio", chunk }), digitalSilence);
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
    ctx.drawImage(bmp, (i % c.columns) * c.cellWidth, Math.floor(i / c.columns) * c.cellHeight, c.cellWidth, c.cellHeight);
    bmp.close();
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return blob ? { ok: true, jpeg: await bytes(blob) } : { ok: false, code: "encoder" };
}

bridge.onCommand((c: RecorderCommand) => {
  void (async () => {
    let result: RecorderResult = { ok: true };
    try {
      if (c.op === "start") result = await start(c);
      else if (c.op === "stop") result = await stop();
      else if (c.op === "switch") result = await swap(c);
      else if (c.op === "sheet") result = await sheet(c);
      else {
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
