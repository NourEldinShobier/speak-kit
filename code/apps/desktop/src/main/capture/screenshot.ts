import { randomBytes } from "node:crypto";
import { nativeImage, type NativeImage } from "electron";
import type { Bundle } from "./bundle";
import type { CapturePlatform } from "./platform/types";
import type { Target } from "./session";
import type { CaptureRecord, CaptureStore } from "./store";

export interface ShotDeps {
  platform: CapturePlatform;
  bundle: Bundle;
  store: CaptureStore;
  title(t: Target): string;
  now(): number;
}

export type ShotResult = { ok: true; record: CaptureRecord; image: NativeImage } | { ok: false; reason: "nothing" };

/** One picture of a target: taken at the screen's own resolution, written to its own folder and added to the list. */
export async function takeScreenshot(d: ShotDeps, target: Target): Promise<ShotResult> {
  const still = await d.platform.still(target);
  if (!still) return { ok: false, reason: "nothing" };
  const id = `s${d.now().toString(36)}${randomBytes(3).toString("hex")}`;
  await d.bundle.open(id);
  await d.bundle.writeFile(id, "shot.png", still.png);
  const record: CaptureRecord = {
    id,
    kind: "screenshot",
    title: `Screenshot · ${d.title(target)}`,
    at: d.now(),
    dir: id,
    bytes: await d.bundle.bytes(id),
    media: "shot.png",
    frames: [],
    chips: ["saved", "copied"],
  };
  await d.store.add(record);
  return { ok: true, record, image: nativeImage.createFromBuffer(still.png) };
}
