import * as v from "valibot";
import { autoRegions, normalizeRegions, zoomCells, type FrameRect, type PointerSample, type ZoomRegion } from "../../../shared/capture/zoom";
import type { Bundle } from "../bundle";
import { shownFile } from "../edits";
import type { CaptureRecord, CaptureStore } from "../store";

export interface ZoomDeps {
  store: CaptureStore;
  bundle: Bundle;
  /** Shows the parts of a recorded video closer; undefined when it could not be done. */
  zoomVideo?(video: Uint8Array, regions: ZoomRegion[]): Promise<Uint8Array | undefined>;
  /** The contact sheet of the zoomed parts, from these pictures and the part of each to show. */
  zoomSheet?(jpegs: Uint8Array[], crops: FrameRect[]): Promise<Uint8Array | undefined>;
  log(line: string): void;
}

export const ZOOM_VIDEO = "video-zoom.webm";
export const ZOOM_SHEET = "sheet-zoom.jpg";

/** The video a zoom starts from: the trimmed copy when there is one, else the recording. */
const baseVideo = (r: CaptureRecord): string => (r.trim ? "video-trim.webm" : "video.webm");
const lengthOf = (r: CaptureRecord): number => (r.trim ? r.trim.endMs - r.trim.startMs : (r.durationMs ?? 0));

const PointerFile = v.array(v.object({ atMs: v.number(), x: v.number(), y: v.number() }));
const EventsFile = v.array(v.object({ atMs: v.number(), kind: v.string() }));

async function readJson<T>(d: ZoomDeps, dir: string, name: string, schema: v.GenericSchema<unknown, T>): Promise<T | undefined> {
  const text = (await d.bundle.readFile(dir, name))?.toString("utf8");
  if (!text) return undefined;
  try {
    const parsed = v.safeParse(schema, JSON.parse(text));
    return parsed.success ? parsed.output : undefined;
  } catch {
    // a file that is not JSON gives no suggestions
    return undefined;
  }
}

/** Zooms chosen from where the pointer rested and where the pen drew, on the timeline of the video shown. */
export async function suggestZoom(d: ZoomDeps, id: string): Promise<ZoomRegion[]> {
  const r = await d.store.get(id);
  if (!r || r.kind !== "recording" || r.finishing) return [];
  const offset = r.trim?.startMs ?? 0;
  const length = lengthOf(r);
  const inside = (atMs: number) => atMs >= 0 && atMs <= length;
  const pointer = ((await readJson(d, r.dir, "pointer.json", PointerFile)) ?? []).map((p) => ({ ...p, atMs: p.atMs - offset })).filter((p) => inside(p.atMs)) satisfies PointerSample[];
  const ink = ((await readJson(d, r.dir, "events.json", EventsFile)) ?? [])
    .filter((e) => e.kind === "ink-start")
    .map((e) => e.atMs - offset)
    .filter(inside);
  return autoRegions(pointer, ink, length);
}

/** Makes the video show these parts closer and keeps the result next to the original, with a contact sheet of the zoomed parts. No regions puts the video back as it was. */
export async function applyZoom(d: ZoomDeps, id: string, regions: readonly ZoomRegion[]): Promise<boolean> {
  const r = await d.store.get(id);
  if (!r || r.kind !== "recording" || r.finishing || !d.zoomVideo || !lengthOf(r)) return false;
  // a recording that followed a switch has more than one video file: it is not zoomed
  if (await d.bundle.readFile(r.dir, "video-2.webm")) return false;
  const clean = normalizeRegions(regions, lengthOf(r));
  if (!regions.length) return restore(d, r);
  if (!clean.length) return false;
  const video = await d.bundle.readFile(r.dir, baseVideo(r));
  if (!video?.length) return false;
  let out: Uint8Array | undefined;
  try {
    out = await d.zoomVideo(new Uint8Array(video), clean);
  } catch (e) {
    d.log(`capture ${id}: the video could not be zoomed (${String(e)})`);
  }
  if (!out?.length) return false;
  await d.bundle.writeFile(r.dir, ZOOM_VIDEO, out);
  const sheet = await makeZoomSheet(d, r, clean);
  const saved = await d.store.mutate(id, () => ({ media: ZOOM_VIDEO, zoom: clean, zoomSheet: sheet ? ZOOM_SHEET : "" }));
  if (!saved) {
    await d.bundle.remove(r.dir);
    return false;
  }
  await d.store.update(id, { bytes: await d.bundle.bytes(r.dir) });
  return true;
}

async function restore(d: ZoomDeps, r: CaptureRecord): Promise<boolean> {
  if (!r.zoom?.length) return true;
  await d.store.mutate(r.id, () => ({ media: baseVideo(r), zoom: [], zoomSheet: "" }));
  return true;
}

async function makeZoomSheet(d: ZoomDeps, r: CaptureRecord, regions: ZoomRegion[]): Promise<boolean> {
  if (!d.zoomSheet) return false;
  const offset = r.trim?.startMs ?? 0;
  const cells = zoomCells(
    regions.map((z) => ({ ...z, startMs: z.startMs + offset, endMs: z.endMs + offset })),
    await d.bundle.frames(r.dir),
  );
  const files = await Promise.all(cells.map((c) => d.bundle.readFile(r.dir, shownFile(r, c.frame.file))));
  const have = cells.flatMap((c, i) => (files[i] ? [{ jpeg: new Uint8Array(files[i]!), crop: c.crop }] : []));
  if (!have.length) return false;
  try {
    const jpeg = await d.zoomSheet(
      have.map((h) => h.jpeg),
      have.map((h) => h.crop),
    );
    if (!jpeg?.length) return false;
    await d.bundle.writeFile(r.dir, ZOOM_SHEET, jpeg);
    return true;
  } catch (e) {
    d.log(`capture ${r.id}: the zoom contact sheet could not be made (${String(e)})`);
    return false;
  }
}
