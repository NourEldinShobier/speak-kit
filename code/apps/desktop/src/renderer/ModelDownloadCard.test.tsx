import { describe, expect, it } from "vite-plus/test";
import { downloadLine } from "./ModelDownloadCard";

describe("downloadLine", () => {
  it("reads percent, then downloaded of total, with a middle dot", () => {
    expect(downloadLine({ pct: 0.62, totalMb: 177, paused: false })).toBe("62% · 110 MB of 177 MB");
    expect(downloadLine({ pct: 0, totalMb: 177, paused: false })).toBe("0% · 0 MB of 177 MB");
    expect(downloadLine({ pct: 1, totalMb: 177, paused: false })).toBe("100% · 177 MB of 177 MB");
  });

  it("says where a paused download stopped", () => {
    expect(downloadLine({ pct: 0.62, totalMb: 177, paused: true })).toBe("Paused at 62% · 110 MB of 177 MB");
  });
});
