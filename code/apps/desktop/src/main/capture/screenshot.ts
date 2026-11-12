import { noticeFor, noticeOfError, type Notice } from "../../shared/capture/notices";
import { writeCapture } from "./clipboard-out";
import { titleOfTarget } from "./target-display";
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

export interface ShootDeps {
  platform: CapturePlatform;
  history: { bundle: Bundle; store: CaptureStore };
  pick(): Promise<Target | null>;
  /** False once the capture session was replaced: nothing more is shown. */
  current(): boolean;
  notify(n: Notice): void;
  log(line: string): void;
  shown(record: CaptureRecord): void;
}

/** Pick, take one picture, copy it, and hand the record over for the corner card. Every failure becomes a notice. */
export async function shootFlow(d: ShootDeps): Promise<void> {
  const p = d.platform;
  if (p.screenPermission() === "denied") return d.notify(noticeFor("permission-denied", { os: p.os }));
  try {
    const target = await d.pick();
    if (!target || !d.current()) return;
    const shot = await takeScreenshot({ platform: p, bundle: d.history.bundle, store: d.history.store, title: (t) => titleOfTarget(t, p.displays()), now: Date.now }, target);
    if (!d.current()) return;
    if (!shot.ok) return d.notify(noticeFor("nothing-recorded"));
    await writeCapture("", shot.image);
    d.shown(shot.record);
  } catch (e) {
    d.log(`screenshot failed: ${String(e)}`);
    d.notify(noticeOfError(e, { os: p.os }));
  }
}
