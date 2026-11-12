import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { FrameRect, ZoomRegion } from "../../../shared/capture/zoom";
import { createBundle } from "../bundle";
import { createStore, type CaptureRecord, type StoreFs } from "../store";
import { applyZoom, suggestZoom, ZOOM_SHEET, ZOOM_VIDEO, type ZoomDeps } from ".";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "zoom-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const memory = (): StoreFs => {
  let text: string | undefined;
  return { read: async () => text, write: async (_f, t) => void (text = t) };
};
const region = (startMs: number, endMs: number, o: Partial<ZoomRegion> = {}): ZoomRegion => ({ startMs, endMs, x: 0.5, y: 0.5, scale: 2, ...o });
const frameFile = (ms: number) => path.join("frames", `f-${String(ms).padStart(8, "0")}.jpg`);

interface Options {
  record?: Partial<CaptureRecord>;
  video?: (v: Uint8Array, r: ZoomRegion[]) => Promise<Uint8Array | undefined>;
  sheet?: ZoomDeps["zoomSheet"];
  noZoom?: boolean;
}

async function setup(o: Options = {}) {
  const bundle = createBundle(dir);
  const store = createStore(memory(), "index.json");
  await bundle.open("r1");
  for (const ms of [0, 1000, 2000, 3000, 4000]) await bundle.writeFile("r1", frameFile(ms), `jpeg${ms}`);
  await bundle.writeFile("r1", "video.webm", "video");
  await store.add({ id: "r1", kind: "recording", title: "T", at: 1, dir: "r1", durationMs: 5000, bytes: 0, media: "video.webm", frames: [], chips: ["saved"], ...o.record });
  const logs: string[] = [];
  const calls: { video: string; regions: ZoomRegion[]; crops?: FrameRect[]; jpegs?: string[] }[] = [];
  const deps: ZoomDeps = {
    store,
    bundle,
    log: (l) => logs.push(l),
    ...(!o.noZoom && {
      zoomVideo:
        o.video ??
        (async (video, regions) => {
          calls.push({ video: Buffer.from(video).toString(), regions });
          return new Uint8Array([7, 7]);
        }),
    }),
    zoomSheet:
      o.sheet ??
      (async (jpegs, crops) => {
        calls.push({ video: "", regions: [], crops, jpegs: jpegs.map((j) => Buffer.from(j).toString()) });
        return new Uint8Array([8]);
      }),
  };
  return { deps, store, bundle, logs, calls };
}

describe("zooming a recording", () => {
  it("keeps the zoomed video next to the original and writes the contact sheet of the zoomed parts", async () => {
    const t = await setup();
    const late = region(2800, 4500, { x: 0.95, y: 0.5 });
    expect(await applyZoom(t.deps, "r1", [late, region(0, 1500)])).toBe(true);
    expect(await t.store.get("r1")).toMatchObject({ media: ZOOM_VIDEO, zoom: [region(0, 1500), late], zoomSheet: ZOOM_SHEET });
    expect([...((await t.bundle.readFile("r1", ZOOM_VIDEO)) ?? [])]).toEqual([7, 7]);
    expect(String(await t.bundle.readFile("r1", "video.webm"))).toBe("video");
    expect([...((await t.bundle.readFile("r1", ZOOM_SHEET)) ?? [])]).toEqual([8]);
    expect(t.calls[0]).toMatchObject({ video: "video", regions: [region(0, 1500), late] });
    expect(t.calls[1]).toMatchObject({
      jpegs: ["jpeg1000", "jpeg4000"],
      crops: [
        { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        { x: 0.5, y: 0.25, width: 0.5, height: 0.5 },
      ],
    });
    expect((await t.store.get("r1"))!.bytes).toBeGreaterThan(0);
  });

  it("zooms the trimmed copy, and picks sheet pictures on the timeline of the original recording", async () => {
    const t = await setup({ record: { trim: { startMs: 2000, endMs: 5000 }, media: "video-trim.webm", durationMs: 5000 } });
    await t.bundle.writeFile("r1", "video-trim.webm", "trimmed");
    expect(await applyZoom(t.deps, "r1", [region(0, 1500)])).toBe(true);
    expect(t.calls[0]!.video).toBe("trimmed");
    expect(t.calls[1]!.jpegs).toEqual(["jpeg3000"]);
  });

  it("uses the edited picture in the sheet", async () => {
    const t = await setup({ record: { edits: { [frameFile(1000)]: "edit-f-00001000.png" } } });
    await t.bundle.writeFile("r1", "edit-f-00001000.png", "edited");
    await applyZoom(t.deps, "r1", [region(0, 1500)]);
    expect(t.calls[1]!.jpegs).toEqual(["edited"]);
  });

  it("clips the regions to the recording and refuses ones that leave nothing", async () => {
    const t = await setup();
    expect(await applyZoom(t.deps, "r1", [region(4800, 4900)])).toBe(false);
    expect((await t.store.get("r1"))!.media).toBe("video.webm");
    expect(t.calls).toEqual([]);
  });

  it("goes on without a sheet when the sheet cannot be made", async () => {
    const t = await setup({
      sheet: async () => {
        throw new Error("no window");
      },
    });
    expect(await applyZoom(t.deps, "r1", [region(0, 1500)])).toBe(true);
    expect((await t.store.get("r1"))!.zoomSheet).toBe("");
    expect(t.logs).toEqual(["capture r1: the zoom contact sheet could not be made (Error: no window)"]);
  });

  it("changes nothing when the video cannot be zoomed", async () => {
    const empty = await setup({ video: async () => undefined });
    expect(await applyZoom(empty.deps, "r1", [region(0, 1500)])).toBe(false);
    const broken = await setup({
      video: async () => {
        throw new Error("encoder");
      },
    });
    expect(await applyZoom(broken.deps, "r1", [region(0, 1500)])).toBe(false);
    expect(broken.logs).toEqual(["capture r1: the video could not be zoomed (Error: encoder)"]);
    expect((await broken.store.get("r1"))!.media).toBe("video.webm");
  });

  it("refuses a screenshot, a capture still finishing, a recording with two videos and a missing zoom service", async () => {
    expect(await applyZoom((await setup({ record: { kind: "screenshot" } })).deps, "r1", [region(0, 1500)])).toBe(false);
    expect(await applyZoom((await setup({ record: { finishing: true } })).deps, "r1", [region(0, 1500)])).toBe(false);
    const two = await setup();
    await two.bundle.writeFile("r1", "video-2.webm", "x");
    expect(await applyZoom(two.deps, "r1", [region(0, 1500)])).toBe(false);
    expect(await applyZoom((await setup({ noZoom: true })).deps, "r1", [region(0, 1500)])).toBe(false);
    expect(await applyZoom((await setup()).deps, "gone", [region(0, 1500)])).toBe(false);
  });

  it("puts the video back as it was when no regions are given", async () => {
    const t = await setup();
    await applyZoom(t.deps, "r1", [region(0, 1500)]);
    expect(await applyZoom(t.deps, "r1", [])).toBe(true);
    expect(await t.store.get("r1")).toMatchObject({ media: "video.webm", zoom: [], zoomSheet: "" });
    const trimmed = await setup({ record: { trim: { startMs: 1000, endMs: 4000 }, media: "video-trim.webm" } });
    await trimmed.bundle.writeFile("r1", "video-trim.webm", "t");
    await applyZoom(trimmed.deps, "r1", [region(0, 1500)]);
    await applyZoom(trimmed.deps, "r1", []);
    expect((await trimmed.store.get("r1"))!.media).toBe("video-trim.webm");
    expect(await applyZoom((await setup()).deps, "r1", [])).toBe(true);
  });
});

describe("suggested zooms", () => {
  const rest = Array.from({ length: 6 }, (_, i) => ({ atMs: 3000 + i * 200, x: 0.5, y: 0.5 }));

  it("come from where the pointer rested and where the pen drew", async () => {
    const t = await setup();
    await t.bundle.writeFile("r1", "pointer.json", JSON.stringify([...rest, { atMs: 100, x: 0.2, y: 0.7 }]));
    await t.bundle.writeFile(
      "r1",
      "events.json",
      JSON.stringify([
        { atMs: 100, kind: "ink-start" },
        { atMs: 200, kind: "ink-end" },
      ]),
    );
    expect(await suggestZoom(t.deps, "r1")).toEqual([region(100, 2100, { x: 0.2, y: 0.7 }), region(3000, 4800)]);
  });

  it("come from where the button was pressed, read back from the pointer file", async () => {
    const t = await setup();
    await t.bundle.writeFile("r1", "pointer.json", JSON.stringify([{ atMs: 3000, x: 0.8, y: 0.2, click: true }]));
    expect(await suggestZoom(t.deps, "r1")).toEqual([region(2700, 5000, { x: 0.8, y: 0.2 })]);
  });

  it("carry a smoothed path when the pointer moved after the click", async () => {
    const t = await setup();
    await t.bundle.writeFile(
      "r1",
      "pointer.json",
      JSON.stringify([
        { atMs: 3000, x: 0.4, y: 0.4, click: true },
        { atMs: 3200, x: 0.6, y: 0.4 },
      ]),
    );
    const [zoom] = await suggestZoom(t.deps, "r1");
    expect(zoom).toMatchObject({ startMs: 2700, endMs: 5000, x: 0.4, y: 0.4 });
    expect(zoom?.path).toEqual([
      { atMs: 3000, x: 0.4, y: 0.4 },
      { atMs: 3200, x: 0.47, y: 0.4 },
    ]);
  });

  it("use the timeline of the trimmed copy and leave out what was cut away", async () => {
    const t = await setup({ record: { trim: { startMs: 2000, endMs: 5000 }, media: "video-trim.webm" } });
    await t.bundle.writeFile("r1", "pointer.json", JSON.stringify([...rest, { atMs: 100, x: 0.2, y: 0.7 }]));
    await t.bundle.writeFile("r1", "events.json", JSON.stringify([{ atMs: 100, kind: "ink-start" }]));
    expect(await suggestZoom(t.deps, "r1")).toEqual([region(1000, 2800)]);
  });

  it("are empty without the files, with damaged ones, and for a screenshot", async () => {
    const t = await setup();
    expect(await suggestZoom(t.deps, "r1")).toEqual([]);
    await t.bundle.writeFile("r1", "pointer.json", "{not json");
    await t.bundle.writeFile("r1", "events.json", JSON.stringify([{ nope: 1 }]));
    expect(await suggestZoom(t.deps, "r1")).toEqual([]);
    expect(await suggestZoom((await setup({ record: { kind: "screenshot" } })).deps, "r1")).toEqual([]);
    expect(await suggestZoom(t.deps, "gone")).toEqual([]);
  });

  it("take a pointer sample and a stroke at the very start of the trimmed copy, and none before it", async () => {
    const t = await setup({ record: { trim: { startMs: 1000, endMs: 4000 }, media: "video-trim.webm" } });
    await t.bundle.writeFile(
      "r1",
      "pointer.json",
      JSON.stringify([
        { atMs: 999, x: 0.9, y: 0.9 },
        { atMs: 1000, x: 0.2, y: 0.7 },
      ]),
    );
    await t.bundle.writeFile(
      "r1",
      "events.json",
      JSON.stringify([
        { atMs: 999, kind: "ink-start" },
        { atMs: 1000, kind: "ink-start" },
        { atMs: 1500, kind: "ink-end" },
      ]),
    );
    expect(await suggestZoom(t.deps, "r1")).toEqual([region(0, 2000, { x: 0.2, y: 0.7 })]);
  });

  it("leave out a pointer sample and a stroke after the end of the trimmed copy", async () => {
    const t = await setup({ record: { trim: { startMs: 1000, endMs: 4000 }, media: "video-trim.webm" } });
    const late = Array.from({ length: 6 }, (_, i) => ({ atMs: 4200 + i * 200, x: 0.5, y: 0.5 }));
    await t.bundle.writeFile("r1", "pointer.json", JSON.stringify(late));
    await t.bundle.writeFile("r1", "events.json", JSON.stringify([{ atMs: 4500, kind: "ink-start" }]));
    expect(await suggestZoom(t.deps, "r1")).toEqual([]);
  });

  it("zoom nothing when the video to start from is missing or empty, and when the zoom comes back empty", async () => {
    const gone = await setup({ record: { trim: { startMs: 1000, endMs: 4000 }, media: "video-trim.webm" } });
    expect(await applyZoom(gone.deps, "r1", [region(0, 1500)])).toBe(false);
    const empty = await setup();
    await empty.bundle.writeFile("r1", "video.webm", "");
    expect(await applyZoom(empty.deps, "r1", [region(0, 1500)])).toBe(false);
    const nothing = await setup({ video: async () => new Uint8Array() });
    expect(await applyZoom(nothing.deps, "r1", [region(0, 1500)])).toBe(false);
    expect((await nothing.store.get("r1"))!.media).toBe("video.webm");
  });

  it("make no sheet when it comes back empty, and when no picture of a zoomed part exists", async () => {
    const empty = await setup({ sheet: async () => new Uint8Array() });
    expect(await applyZoom(empty.deps, "r1", [region(0, 1500)])).toBe(true);
    expect((await empty.store.get("r1"))!.zoomSheet).toBe("");
    const bare = await setup();
    await rm(path.join(dir, "r1", "frames"), { recursive: true });
    expect(await applyZoom(bare.deps, "r1", [region(0, 1500)])).toBe(true);
    expect((await bare.store.get("r1"))!.zoomSheet).toBe("");
  });

  it("treat an empty pointer file as no suggestions", async () => {
    const t = await setup();
    await t.bundle.writeFile("r1", "pointer.json", "");
    expect(await suggestZoom(t.deps, "r1")).toEqual([]);
  });
});
