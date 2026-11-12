export const once = (el: HTMLVideoElement, event: string): Promise<void> =>
  new Promise((resolve, reject) => {
    el.addEventListener(event, () => resolve(), { once: true });
    el.addEventListener("error", () => reject(new Error("video could not be read")), { once: true });
  });

/** A recorded WebM ready to play from a given time: a file that never started is refused instead of waiting for ever. `close` lets go of it. */
export async function openVideo(data: Uint8Array, startMs: number): Promise<{ video: HTMLVideoElement; close(): void }> {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "video/webm" }));
  const video = document.createElement("video");
  video.muted = true;
  video.src = url;
  const close = () => {
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  };
  try {
    await once(video, "loadedmetadata");
    if (!Number.isFinite(video.duration)) {
      // a recorder's file has no length until the browser has read it to its end: asking for a time far past it does that
      video.currentTime = 1e9;
      await once(video, "durationchange");
    }
    video.currentTime = startMs / 1000;
    await once(video, "seeked");
    return { video, close };
  } catch (e) {
    close();
    throw e;
  }
}
