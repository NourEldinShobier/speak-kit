import { describe, expect, it } from "vite-plus/test";
import { noticeFor } from "./notify-rules";

describe("engine notices", () => {
  it("never announces that the model or engine became ready", () => {
    expect(noticeFor("downloading", "unloaded", undefined)).toBeNull();
    expect(noticeFor("downloading", "ready", undefined)).toBeNull();
    expect(noticeFor("loading", "ready", undefined)).toBeNull();
    expect(noticeFor("ready", "unloaded", undefined)).toBeNull();
    expect(noticeFor("downloading", "downloading", undefined)).toBeNull();
    expect(noticeFor("downloading", "missing", undefined)).toBeNull();
  });
  it("a download that fails is an engine error, once per transition", () => {
    expect(noticeFor("downloading", "error", "connection reset")?.event).toBe("engine-error");
    expect(noticeFor("loading", "error", "worker exited")?.body).toBe("worker exited Click to open Speak Kit.");
    expect(noticeFor("error", "error", "again")).toBeNull();
  });
});
