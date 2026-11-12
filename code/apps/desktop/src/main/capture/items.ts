import { nativeImage } from "electron";
import type { CaptureDetail, CaptureItem } from "../../shared/capture/contract";
import type { Bundle } from "./bundle";
import { shownFile } from "./edits";
import type { CaptureRecord } from "./store";

const THUMB_PX = 160;
const FRAME_PX = 640;
const MAX_FRAMES = 12;
const SHOT_PX = 1280;

/** The picture a capture shows in the list: the contact sheet or the screenshot. */
const coverOf = (r: CaptureRecord): string | undefined => (r.kind === "screenshot" ? shownFile(r, r.media) : r.sheet);

async function dataUrl(bundle: Bundle, ref: { id: string; file: string | undefined }, width: number): Promise<string | undefined> {
  if (!ref.file) return undefined;
  const buf = await bundle.readFile(ref.id, ref.file);
  if (!buf?.length) return undefined;
  const image = nativeImage.createFromBuffer(buf);
  if (image.isEmpty()) return undefined;
  return (image.getSize().width > width ? image.resize({ width, quality: "good" }) : image).toDataURL();
}

export async function toItem(bundle: Bundle, r: CaptureRecord): Promise<CaptureItem> {
  const thumb = await dataUrl(bundle, { id: r.dir, file: coverOf(r) }, THUMB_PX);
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    at: r.at,
    ...(r.durationMs !== undefined && { durationMs: r.durationMs }),
    wordCount: r.words?.length ?? 0,
    bytes: r.bytes,
    chips: r.chips,
    finishing: !!r.finishing,
    ...(thumb && { thumb }),
  };
}

/** The pictures of a capture, as the detail shows them: a screenshot is its own single picture. */
async function framesOf(bundle: Bundle, r: CaptureRecord): Promise<CaptureDetail["frames"]> {
  const frames: CaptureDetail["frames"] = [];
  const files = r.kind === "screenshot" ? [r.media] : r.frames.slice(0, MAX_FRAMES);
  for (const file of files) {
    const src = await dataUrl(bundle, { id: r.dir, file: shownFile(r, file) }, r.kind === "screenshot" ? SHOT_PX : FRAME_PX);
    if (src) frames.push({ atMs: Number(/f-(\d+)/.exec(file)?.[1] ?? 0), src, file, edited: shownFile(r, file) !== file });
  }
  return frames;
}

export async function toDetail(bundle: Bundle, r: CaptureRecord): Promise<CaptureDetail> {
  const trimmable = r.kind === "recording" && !r.finishing && !!r.durationMs && r.media.endsWith(".webm");
  const zoomSheet = await dataUrl(bundle, { id: r.dir, file: r.zoomSheet || undefined }, FRAME_PX);
  return {
    ...(await toItem(bundle, r)),
    words: r.words ?? [],
    frames: await framesOf(bundle, r),
    path: bundle.dir(r.dir),
    trimmable,
    zoomable: trimmable,
    ...(r.trim && { trim: r.trim }),
    ...(r.zoom?.length && { zoom: r.zoom }),
    ...(zoomSheet && { zoomSheet }),
  };
}
