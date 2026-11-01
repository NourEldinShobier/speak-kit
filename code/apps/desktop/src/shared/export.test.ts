import { describe, expect, it } from "vite-plus/test";
import { estimateBytes, safeFileName } from "./export";

const BACKSLASH = String.fromCharCode(92);

describe("safeFileName", () => {
  it("replaces what Windows rejects and trims", () => {
    expect(safeFileName('My: "chapter"?')).toBe("My chapter");
    expect(safeFileName(`a/b${BACKSLASH}c|d*e`)).toBe("a b c d e");
    expect(safeFileName("tab\there")).toBe("tab here");
    expect(safeFileName("  ends with dots...  ")).toBe("ends with dots");
  });
  it("never returns an empty or reserved name", () => {
    expect(safeFileName("???")).toBe("SpeakKit reading");
    expect(safeFileName("CON")).toBe("CON reading");
    expect(safeFileName("x".repeat(200))).toHaveLength(80);
  });
});

describe("estimateBytes", () => {
  it("WAV is 48 000 bytes per second plus the header; MP3 follows the bitrate", () => {
    const text = "x".repeat(150); // 10 s at 15 characters per second
    expect(estimateBytes(text, 1, "wav", 192)).toBe(480_044);
    expect(estimateBytes(text, 1, "mp3", 192)).toBe(240_000);
    expect(estimateBytes(text, 2, "mp3", 128)).toBe(80_000);
  });
});
