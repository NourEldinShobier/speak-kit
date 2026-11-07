import { describe, expect, it } from "vite-plus/test";
import { downloadLine } from "./ModelDownloadCard";

describe("downloadLine", () => {
  it("reads percent, then downloaded of total, with a middle dot", () => {
    expect(downloadLine(0.62, 177, false)).toBe("62% · 110 MB of 177 MB");
    expect(downloadLine(0, 177, false)).toBe("0% · 0 MB of 177 MB");
    expect(downloadLine(1, 177, false)).toBe("100% · 177 MB of 177 MB");
  });

  it("says where a paused download stopped", () => {
    expect(downloadLine(0.62, 177, true)).toBe("Paused at 62% · 110 MB of 177 MB");
  });
});
