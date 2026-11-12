import { cropAt, inPixels, type ZoomRegion } from "../../../shared/capture/zoom";
import { MIME } from "./recorder-run";
import { openVideo } from "./video-source";

const PAINT_MS = 40;

/**
 * Shows parts of a recorded WebM closer: the video plays onto a canvas that draws, at each moment, the part of the picture the zoom regions ask for
 * (gliding in and out), and the canvas is recorded again with the browser's own encoder. It runs at the speed of the video.
 */
export async function zoomVideo(data: Uint8Array, regions: readonly ZoomRegion[]): Promise<Uint8Array> {
  const { video, close } = await openVideo(data, 0);
  try {
    const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mimeType || !video.videoWidth || !video.videoHeight) throw new Error("encoder failed");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    const paint = () => {
      const c = inPixels(cropAt(regions, video.currentTime * 1000), canvas.width, canvas.height);
      ctx.drawImage(video, c.x, c.y, c.width, c.height, 0, 0, canvas.width, canvas.height);
    };
    paint();
    const rec = new MediaRecorder(canvas.captureStream(25), { mimeType, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
    rec.start(1000);
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
    rec.stop();
    await stopped;
    return new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
  } finally {
    close();
  }
}
