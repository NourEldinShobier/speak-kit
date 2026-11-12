import { MIME } from "./recorder-run";

const once = (el: HTMLVideoElement, event: string): Promise<void> =>
  new Promise((resolve, reject) => {
    el.addEventListener(event, () => resolve(), { once: true });
    el.addEventListener("error", () => reject(new Error("video could not be read")), { once: true });
  });

/**
 * Cuts a recorded WebM to a time range by playing that range and recording it again (the browser's own encoder; nothing is added to the app). It runs
 * at the speed of the video, so a minute of video takes a minute. A file that never started is refused instead of waiting for ever.
 */
export async function trimVideo(data: Uint8Array, startMs: number, endMs: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "video/webm" }));
  const video = document.createElement("video");
  video.muted = true;
  video.src = url;
  try {
    await once(video, "loadedmetadata");
    if (!Number.isFinite(video.duration)) {
      // a recorder's file has no length until the browser has read it to its end: asking for a time far past it does that
      video.currentTime = 1e9;
      await once(video, "durationchange");
    }
    video.currentTime = startMs / 1000;
    await once(video, "seeked");
    const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mimeType) throw new Error("encoder failed");
    const rec = new MediaRecorder((video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream(), { mimeType, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
    rec.start(1000);
    await video.play();
    const limit = Date.now() + (endMs - startMs) + 15_000;
    await new Promise<void>((resolve) => {
      const tick = setInterval(() => {
        if (video.currentTime * 1000 < endMs && !video.ended && Date.now() <= limit) return;
        clearInterval(tick);
        resolve();
      }, 50);
    });
    video.pause();
    rec.stop();
    await stopped;
    return new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
  } finally {
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}
