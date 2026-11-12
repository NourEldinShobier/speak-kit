import { describe, expect, it } from "vitest";
import type { CaptureItem, CaptureStatus } from "../../../shared/capture/contract";
import { formatBytes, INK_LABEL, itemChip, RETENTION_LABEL, unavailable } from "./format";

describe("sizes", () => {
  it("switches units exactly at the limits", () => {
    expect(formatBytes(1e9)).toBe("1.0 GB");
    expect(formatBytes(999_000_000)).toBe("999 MB");
    expect(formatBytes(10_000_000)).toBe("10 MB");
    expect(formatBytes(9_900_000)).toBe("9.9 MB");
    expect(formatBytes(1_000_000)).toBe("1 MB");
    expect(formatBytes(1_400_000)).toBe("1.4 MB");
    expect(formatBytes(100_000)).toBe("0.1 MB");
    expect(formatBytes(99_000)).toBe("99 KB");
    expect(formatBytes(0)).toBe("1 KB");
  });
});

describe("chips and labels", () => {
  const item = (chips: string[]) => ({ chips }) as CaptureItem;
  it("says what happened to a capture, the most telling first", () => {
    expect(itemChip(item(["saved", "copied", "sent"]))).toEqual({ label: "Sent to Voice chat", tone: "sent" });
    expect(itemChip(item(["saved", "copied"]))).toEqual({ label: "Copied", tone: "copied" });
    expect(itemChip(item(["saved"]))).toEqual({ label: "Saved", tone: "saved" });
  });
  it("names every keep time and ink time", () => {
    expect(RETENTION_LABEL).toEqual({ 7: "7 days", 30: "30 days", 90: "90 days", 0: "Forever" });
    expect(INK_LABEL).toEqual({ 1000: "About 1 second", 3000: "About 3 seconds", 0: "Until cleared" });
  });
});

describe("what is not possible", () => {
  const status = (o: Partial<CaptureStatus>) => ({ supported: true, permission: "granted", ...o }) as CaptureStatus;
  it("says capture is not available where it is not built", () => {
    expect(unavailable(status({ supported: false }))).toBe("Capture is not available on this computer yet.");
  });
  it("asks for the screen permission when it is denied, and only then", () => {
    expect(unavailable(status({ permission: "denied" }))).toBe("Speak Kit needs Screen Recording permission before it can capture. Open System Settings, allow Speak Kit, then try again.");
    expect(unavailable(status({ permission: "not-determined" }))).toBeNull();
    expect(unavailable(status({}))).toBeNull();
  });
});
