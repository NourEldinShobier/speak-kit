import type { RecorderPayload } from "../../../shared/capture/contract";
import type { MicTrack } from "./mic-track";

export const MIME = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const DRAW_MS = 100;
export type Crop = { x: number; y: number; width: number; height: number };
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

export class Run {
  readonly canvas = document.createElement("canvas");
  readonly ctx = this.canvas.getContext("2d")!;
  readonly video = document.createElement("video");
  /** The moment the picture starts: set again when the first video segment starts, because opening the source can take seconds. */
  startedAt = performance.now();
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
  readonly #send: (d: RecorderPayload) => void;

  /** Chunks of video still being turned into bytes: the recorder is not done until they were sent. */
  readonly #pending = new Set<Promise<void>>();

  constructor(maxSide: number, send: (d: RecorderPayload) => void) {
    this.#maxSide = maxSide;
    this.#send = send;
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
    if (this.segment === 1) this.startedAt = performance.now();
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
        rec.ondataavailable = (e) => e.data.size && this.#sendVideo(e.data, segment);
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

  #sendVideo(data: Blob, segment: number): void {
    const p = bytes(data).then((chunk) => this.#send({ kind: "video", segment, chunk }));
    const tracked = p.finally(() => this.#pending.delete(tracked));
    this.#pending.add(tracked);
  }

  async #takeFrame(): Promise<void> {
    const blob = await new Promise<Blob | null>((r) => this.canvas.toBlob(r, "image/jpeg", 0.8));
    if (!blob) return;
    this.frames++;
    this.#send({ kind: "frame", atMs: Math.round(performance.now() - this.startedAt), jpeg: await bytes(blob) });
  }

  async endSegment(): Promise<void> {
    const rec = this.#recorder;
    this.#recorder = undefined;
    if (!rec || rec.state === "inactive") return;
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    // The last chunk comes with the stop; it must be sent before the caller answers that the recording is done.
    await Promise.all(this.#pending);
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
