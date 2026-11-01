import { describe, expect, it } from "vite-plus/test";
import { noticeFor, THROTTLE_MS } from "./notify-rules";

const on = { download: true, error: true };

describe("native notification rules", () => {
  it("download finished: downloading to unloaded or ready", () => {
    expect(noticeFor("downloading", "unloaded", undefined, on, {}, 0)?.kind).toBe("download");
    expect(noticeFor("downloading", "ready", undefined, on, {}, 0)?.title).toBe("Voice model downloaded");
  });
  it("no toast while still downloading, on failure with errors off, or for plain load and unload", () => {
    expect(noticeFor("downloading", "downloading", undefined, on, {}, 0)).toBeNull();
    expect(noticeFor("downloading", "error", "x", { download: true, error: false }, {}, 0)).toBeNull();
    expect(noticeFor("ready", "unloaded", undefined, on, {}, 0)).toBeNull();
    expect(noticeFor("loading", "ready", undefined, on, {}, 0)).toBeNull();
  });
  it("engine error carries the detail once per transition", () => {
    expect(noticeFor("loading", "error", "worker exited", on, {}, 0)?.body).toContain("worker exited");
    expect(noticeFor("error", "error", "again", on, {}, 0)).toBeNull();
  });
  it("respects the switches and the 10 minute throttle per kind", () => {
    expect(noticeFor("downloading", "ready", undefined, { download: false, error: true }, {}, 0)).toBeNull();
    expect(noticeFor("loading", "error", "x", on, { error: 1000 }, 1000 + THROTTLE_MS - 1)).toBeNull();
    expect(noticeFor("loading", "error", "x", on, { error: 1000 }, 1000 + THROTTLE_MS)?.kind).toBe("error");
    expect(noticeFor("loading", "error", "x", on, { download: 1000 }, 1001)?.kind).toBe("error");
  });
});
