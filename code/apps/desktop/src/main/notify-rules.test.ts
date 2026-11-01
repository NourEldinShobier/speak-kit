import { describe, expect, it } from "vite-plus/test";
import { noticeFor } from "./notify-rules";

describe("engine notices", () => {
  it("download finished: downloading to unloaded or ready", () => {
    expect(noticeFor("downloading", "unloaded", undefined)?.event).toBe("download-done");
    expect(noticeFor("downloading", "ready", undefined)?.title).toBe("Voice model downloaded");
  });
  it("nothing while still downloading, on failure, or for plain load and unload", () => {
    expect(noticeFor("downloading", "downloading", undefined)).toBeNull();
    expect(noticeFor("downloading", "missing", undefined)).toBeNull();
    expect(noticeFor("ready", "unloaded", undefined)).toBeNull();
    expect(noticeFor("loading", "ready", undefined)).toBeNull();
  });
  it("a download that fails is an engine error, once per transition", () => {
    expect(noticeFor("downloading", "error", "connection reset")?.event).toBe("engine-error");
    expect(noticeFor("loading", "error", "worker exited")?.body).toBe("worker exited Click to open SpeakKit.");
    expect(noticeFor("error", "error", "again")).toBeNull();
  });
});
