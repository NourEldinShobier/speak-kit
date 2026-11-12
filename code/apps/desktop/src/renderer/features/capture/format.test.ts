import { describe, expect, it } from "vitest";
import type { CaptureItem } from "../../../shared/capture/contract";
import { duration, formatBytes, itemChip, itemSubtitle, listFooter } from "./format";

const item = (extra: Partial<CaptureItem> = {}): CaptureItem => ({
  id: "a",
  kind: "recording",
  title: "t",
  at: 0,
  wordCount: 62,
  bytes: 14_000_000,
  chips: ["saved"],
  finishing: false,
  durationMs: 48_000,
  ...extra,
});

describe("capture list text", () => {
  it("describes a recording with its words and size", () => {
    expect(itemSubtitle(item())).toBe("0:48 · 62 words · 14 MB");
    expect(itemSubtitle(item({ wordCount: 1 }))).toBe("0:48 · 1 word · 14 MB");
    expect(itemSubtitle(item({ wordCount: 0, durationMs: 23_000, bytes: 9_000_000 }))).toBe("0:23 · no narration · 9 MB");
  });
  it("describes a screenshot and a capture still finishing", () => {
    expect(itemSubtitle(item({ kind: "screenshot", bytes: 1_400_000 }))).toBe("Picture · 1.4 MB");
    expect(itemSubtitle(item({ finishing: true }))).toBe("Finishing");
  });
  it("picks the most telling chip", () => {
    expect(itemChip(item({ chips: ["saved", "copied", "sent"] })).label).toBe("Sent to Voice chat");
    expect(itemChip(item({ chips: ["saved", "copied"] })).label).toBe("Copied");
    expect(itemChip(item({ chips: ["saved"] })).label).toBe("Saved");
  });
  it("formats sizes and durations at their edges", () => {
    expect([formatBytes(10), formatBytes(600_000), formatBytes(1_400_000), formatBytes(2_500_000_000)]).toEqual(["1 KB", "0.6 MB", "1.4 MB", "2.5 GB"]);
    expect([duration(0), duration(125_000), duration(-4)]).toEqual(["0:00", "2:05", "0:00"]);
  });
  it("says how long captures are kept, and where they go", () => {
    expect(listFooter(5, 30, "win32")).toBe("5 captures. Kept for 30 days, then moved to the Recycle Bin.");
    expect(listFooter(1, 7, "darwin")).toBe("1 capture. Kept for 7 days, then moved to the Trash.");
    expect(listFooter(2, 0, "win32")).toBe("2 captures. Kept until you delete them.");
  });
});
