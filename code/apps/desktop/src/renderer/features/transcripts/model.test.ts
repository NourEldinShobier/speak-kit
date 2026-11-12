import { describe, expect, it } from "vite-plus/test";
import { marked, parseTime, segmentAt, audioText, dateText, lengthText, matchText, pieces, progressOf, removedText, sizeText, timerText } from "./model";

describe("lengthText", () => {
  it.each([
    [0, "1 s"],
    [44.6, "45 s"],
    [59, "59 s"],
    [60, "1 min"],
    [89, "1 min"],
    [38 * 60, "38 min"],
    [3599, "1 h"],
    [3600, "1 h"],
    [4320, "1 h 12 min"],
    [4 * 3600, "4 h"],
  ])("%s seconds is %s", (sec, text) => expect(lengthText(sec)).toBe(text));
});

describe("dateText", () => {
  const now = new Date(2026, 10, 12, 15, 0).getTime();
  it("today and yesterday carry the time, 12-hour with AM and PM", () => {
    expect(dateText(new Date(2026, 10, 12, 14, 10).getTime(), now)).toBe("Today, 2:10 PM");
    expect(dateText(new Date(2026, 10, 11, 16, 30).getTime(), now)).toBe("Yesterday, 4:30 PM");
    expect(dateText(new Date(2026, 10, 12, 0, 5).getTime(), now)).toBe("Today, 12:05 AM");
    expect(dateText(new Date(2026, 10, 12, 12, 0).getTime(), now)).toBe("Today, 12:00 PM");
  });
  it("older dates are the month and day, with the year in another year", () => {
    expect(dateText(new Date(2026, 10, 9, 9, 0).getTime(), now)).toBe("Nov 9");
    expect(dateText(new Date(2025, 11, 31, 9, 0).getTime(), now)).toBe("Dec 31, 2025");
  });
});

describe("removedText and audioText", () => {
  it("counts days", () => {
    expect(removedText(29)).toBe("Removed in 29 days");
    expect(removedText(1)).toBe("Removed in 1 day");
    expect(removedText(0)).toBe("Removed today");
    expect(removedText(null)).toBe("");
  });
  it("says how long a recording's audio is kept", () => {
    const rec = { source: "microphone" as const, audioBytes: 5, audioRemoved: false };
    expect(audioText(rec, 5)).toBe("audio kept 5 more days");
    expect(audioText(rec, 1)).toBe("audio kept 1 more day");
    expect(audioText(rec, 0)).toBe("audio removed today");
    expect(audioText(rec, null)).toBe("audio kept");
    expect(audioText({ ...rec, audioBytes: 0, audioRemoved: true }, 3)).toBe("audio removed");
    expect(audioText({ source: "file", audioBytes: 0, audioRemoved: true }, 3)).toBe("");
    expect(audioText({ source: "file", audioBytes: 9, audioRemoved: false }, 3)).toBe("");
    expect(audioText({ source: "file", audioBytes: 0, audioRemoved: false }, 3)).toBe("");
  });
});

describe("timerText and sizeText", () => {
  it("timer", () => {
    expect(timerText(0)).toBe("00:00:00");
    expect(timerText(768.9)).toBe("00:12:48");
    expect(timerText(3 * 3600 + 5)).toBe("03:00:05");
    expect(timerText(-4)).toBe("00:00:00");
  });
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [148 * 1024 ** 2, "148 MB"],
    [1.2 * 1024 ** 3, "1.2 GB"],
    [5 * 1024 ** 3, "5 GB"],
    [2000 * 1024 ** 4, "2000 TB"],
  ])("%s is %s", (n, t) => expect(sizeText(n)).toBe(t));
});

describe("progressOf", () => {
  const base = { chunksDone: 0, chunksTotal: 0, durationSec: 0, source: "file" as const };
  it("a job that is not finished says where it is", () => {
    expect(progressOf({ ...base, status: "queued" })).toEqual({ label: "Waiting for the speech engine", fraction: 0 });
    expect(progressOf({ ...base, status: "queued", queued: 3 })).toEqual({ label: "Waiting, number 3 in line", fraction: 0 });
    expect(progressOf({ ...base, status: "queued", queued: 1 })!.label).toBe("Waiting for the speech engine");
    expect(progressOf({ ...base, status: "recording" })).toEqual({ label: "Recording", fraction: null });
    expect(progressOf({ ...base, status: "transcribing" })).toEqual({ label: "Preparing", fraction: 0 });
    expect(progressOf({ ...base, status: "transcribing", chunksDone: 3, chunksTotal: 4, durationSec: 1200 })).toEqual({ label: "15 of 20 min transcribed", fraction: 0.75 });
    expect(progressOf({ ...base, status: "transcribing", chunksDone: 1, chunksTotal: 2, durationSec: 20 })!.label).toBe("0 of 1 min transcribed");
  });
  it("finished or stopped jobs have no progress", () => {
    for (const status of ["done", "failed", "interrupted", "cancelled"] as const) expect(progressOf({ ...base, status })).toBeNull();
  });
});

describe("pieces and matchText", () => {
  it("cuts text around matches and numbers them", () => {
    expect(
      pieces(
        "Invoice one, invoice two",
        [
          { from: 0, to: 7 },
          { from: 13, to: 20 },
        ],
        2,
      ),
    ).toEqual([
      { text: "Invoice", hit: true, n: 2 },
      { text: " one, ", hit: false },
      { text: "invoice", hit: true, n: 3 },
      { text: " two", hit: false },
    ]);
    expect(pieces("plain", [], 0)).toEqual([{ text: "plain", hit: false }]);
    expect(pieces("", [], 0)).toEqual([]);
  });
  it("match counter", () => {
    expect(matchText(1, 4)).toBe("2 of 4");
    expect(matchText(0, 0)).toBe("No matches");
  });
});

describe("marked", () => {
  it("highlights each typed word where it starts a word, whole word included", () => {
    expect(marked("Ask about the invoices and the Invoice.", "invoice")).toEqual([
      { text: "Ask about the ", hit: false },
      { text: "invoices", hit: true, n: 0 },
      { text: " and the ", hit: false },
      { text: "Invoice", hit: true, n: 1 },
      { text: ".", hit: false },
    ]);
  });
  it("several words, special characters and nothing to find", () => {
    expect(
      marked("pay now (c++)", "pay c++")
        .filter((p) => p.hit)
        .map((p) => p.text),
    ).toEqual(["pay", "c"]);
    expect(marked("plain text", "")).toEqual([{ text: "plain text", hit: false }]);
    expect(marked("", "x")).toEqual([]);
    expect(marked("abc", "zzz")).toEqual([{ text: "abc", hit: false }]);
  });
});

describe("parseTime and segmentAt", () => {
  it.each([
    ["1:23", 83],
    ["01:02:03", 3723],
    ["75", 75],
    [" 0:05 ", 5],
    ["1:60", null],
    ["a", null],
    ["", null],
    ["1:2:3:4", null],
    ["-1", null],
  ])("%s is %s", (t, n) => expect(parseTime(t)).toBe(n));
  it("finds the segment being spoken", () => {
    expect(segmentAt([0, 30, 65], 0)).toBe(0);
    expect(segmentAt([0, 30, 65], 29.9)).toBe(0);
    expect(segmentAt([0, 30, 65], 30)).toBe(1);
    expect(segmentAt([0, 30, 65], 9999)).toBe(2);
    expect(segmentAt([10, 30], 5)).toBe(0);
    expect(segmentAt([], 5)).toBe(0);
  });
});
