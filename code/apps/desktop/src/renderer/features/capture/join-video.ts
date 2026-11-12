import { MIME } from "./recorder-run";
import { openVideo } from "./video-source";

const PAINT_MS = 40;

/** Plays a video to its end (or until it has stalled for too long), painting each moment with `paint`. */
async function playOnto(video: HTMLVideoElement, paint: () => void): Promise<void> {
  paint();
  await video.play();
  const limit = Date.now() + video.duration * 1000 + 15_000;
  await new Promise<void>((resolve) => {
    const tick = setInterval(() => {
      paint();
      if (!video.ended && Date.now() <= limit) return;
      clearInterval(tick);
      resolve();
    }, PAINT_MS);
  });
  video.pause();
}

/**
 * Makes one WebM of several that each play on their own: the pieces play one after the other onto a canvas that the browser's own encoder records.
 * It runs at the speed of the video.
 */
export async function joinVideos(pieces: readonly Uint8Array[]): Promise<Uint8Array> {
  const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) throw new Error("encoder failed");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const chunks: Blob[] = [];
  let rec: MediaRecorder | undefined;
  let stopped: Promise<void> | undefined;
  const begin = (video: HTMLVideoElement) => {
    if (!video.videoWidth || !video.videoHeight) throw new Error("encoder failed");
    [canvas.width, canvas.height] = [video.videoWidth, video.videoHeight];
    const started = (rec = new MediaRecorder(canvas.captureStream(25), { mimeType, videoBitsPerSecond: 2_500_000 }));
    started.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    stopped = new Promise<void>((resolve) => (started.onstop = () => resolve()));
    started.start(1000);
  };
  try {
    for (const data of pieces) {
      const { video, close } = await openVideo(data, 0);
      try {
        if (!rec) begin(video);
        await playOnto(video, () => ctx.drawImage(video, 0, 0, canvas.width, canvas.height));
      } finally {
        close();
      }
    }
  } finally {
    if (rec && rec.state !== "inactive") rec.stop();
    await stopped;
  }
  return new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
}
