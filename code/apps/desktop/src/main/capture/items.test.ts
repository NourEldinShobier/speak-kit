import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron", () => ({ nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) } }));

import type { Bundle } from "./bundle";
import type { CaptureRecord } from "./store";
import { toDetail } from "./items";

const record: CaptureRecord = { id: "r1", kind: "recording", title: "T", at: 1, dir: "r1", durationMs: 15_000, bytes: 1, media: "video.webm", frames: [], chips: [] };
const bundleWith = (files: string[]): Bundle => ({ readFile: async (_id: string, f: string) => (files.includes(f) ? Buffer.from("x") : undefined), dir: () => "/c/r1" }) as unknown as Bundle;

describe("capture detail", () => {
  it("offers to trim and zoom a recording that is one video file", async () => {
    const d = await toDetail(bundleWith(["video.webm"]), record);
    expect([d.trimmable, d.zoomable]).toEqual([true, true]);
  });

  it("does not offer to trim or zoom a recording kept as several video files", async () => {
    const d = await toDetail(bundleWith(["video.webm", "video-2.webm"]), record);
    expect([d.trimmable, d.zoomable]).toEqual([false, false]);
  });
});
