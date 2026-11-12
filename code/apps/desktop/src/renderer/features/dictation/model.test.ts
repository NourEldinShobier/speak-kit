import { describe, expect, it } from "vite-plus/test";
import type { ModelView } from "../../../shared/dictation/contract";
import {
  appName,
  clockText,
  dayLabel,
  downloadText,
  emptyHint,
  entriesText,
  entryLabel,
  etaText,
  expiryText,
  focusAfterDelete,
  groupByDay,
  historyFooter,
  historyLead,
  hotkeyHelp,
  listeningText,
  markChanges,
  mb,
  modelLine,
  numberText,
  rewriteTag,
  timeText,
} from "./model";

const model = (over: Partial<ModelView> = {}): ModelView => ({
  id: "large-v3-turbo-q5_0",
  name: "Whisper Large v3 Turbo",
  tag: "Accurate",
  description: "Best accuracy.",
  bytes: 809_000_000,
  installed: false,
  selected: false,
  languages: ["auto", "en"],
  ...over,
});

describe("model text", () => {
  it("rounds sizes to whole megabytes", () => {
    expect(mb(574_041_195)).toBe("574 MB");
    expect(modelLine(model({ bytes: 466_000_000, description: "Fast on any computer." }))).toBe("466 MB. Fast on any computer.");
  });

  it("says how long a download has left", () => {
    expect(etaText(undefined)).toBe("");
    expect(etaText(20)).toBe("Less than a minute left.");
    expect(etaText(60)).toBe("About 1 minute left.");
    expect(etaText(125)).toBe("About 2 minutes left.");
  });

  it("describes a download in progress", () => {
    expect(downloadText(model({ progress: { kind: "downloading", fraction: 0.38, etaSeconds: 120 } }))).toBe("Downloading 38%, 307 of 809 MB. About 2 minutes left.");
    expect(downloadText(model({ progress: { kind: "downloading", fraction: 0.5 } }))).toBe("Downloading 50%, 405 of 809 MB.");
    expect(downloadText(model())).toBe("Downloading 0%, 0 of 809 MB.");
  });
});

describe("history text", () => {
  const noon = new Date(2026, 10, 11, 12, 0, 0).getTime();
  const at = (daysAgo: number, h = 9, m = 41) => new Date(2026, 10, 11 - daysAgo, h, m).getTime();

  it("formats the time of day", () => {
    expect(timeText(at(0, 21, 41))).toBe("9:41 PM");
    expect(timeText(at(0, 8, 5))).toBe("8:05 AM");
  });

  it("names today and yesterday, and dates the rest", () => {
    expect(dayLabel(at(0, 0, 1), noon)).toBe("Today");
    expect(dayLabel(at(1, 23, 59), noon)).toBe("Yesterday");
    expect(dayLabel(at(3), noon)).toBe("Sunday, November 8");
  });

  it("groups entries that are already newest first by day, keeping their order", () => {
    const e = (id: string, when: number) => ({ id, at: when, text: id, raw: id, durationMs: 0, expiresInMs: null });
    const groups = groupByDay([e("a", at(0, 11)), e("b", at(0, 8)), e("c", at(1)), e("d", at(5))], noon);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Friday, November 6", ["d"]],
    ]);
    expect(groupByDay([], noon)).toEqual([]);
  });

  it("names the program from its file name", () => {
    expect(appName("notepad.exe")).toBe("Notepad");
    expect(appName("WindowsTerminal.EXE")).toBe("WindowsTerminal");
    expect(appName(undefined)).toBe("");
    expect(appName("")).toBe("");
  });

  it("says how long entries are kept", () => {
    expect(historyLead("7d")).toBe("What you dictated, saved on this computer for 7 days.");
    expect(historyLead("24h")).toBe("What you dictated, saved on this computer for 24 hours.");
    expect(historyLead("forever")).toBe("What you dictated, saved on this computer until you delete it.");
    expect(historyLead("off")).toBe("History is off. New dictations are not saved.");
  });

  it("closes the list with a count and the removal rule", () => {
    expect(historyFooter(5, 128, "7d")).toBe("Showing 5 of 128. Entries older than 7 days are removed.");
    expect(historyFooter(3, 3, "30d")).toBe("3 entries. Entries older than 30 days are removed.");
    expect(historyFooter(1, 1, "forever")).toBe("1 entry.");
    expect(historyFooter(2, 9, "24h")).toBe("Showing 2 of 9. Entries older than 24 hours are removed.");
  });

  it("explains an empty history for each setting", () => {
    expect(emptyHint("7d")).toBe("Hold the hotkey in any app and speak. What you dictate shows up here for 7 days.");
    expect(emptyHint("forever")).toBe("Hold the hotkey in any app and speak. What you dictate shows up here.");
    expect(emptyHint("off")).toBe("Hold the hotkey in any app and speak. History is off, so nothing is saved.");
    expect(entriesText(1)).toBe("1 entry");
    expect(entriesText(128)).toBe("128 entries");
  });
});

describe("hotkey help", () => {
  it("says how to leave while the keys are captured, and what the hotkey does otherwise", () => {
    expect(hotkeyHelp(true)).toBe("Press the keys you want to use. Esc cancels.");
    expect(hotkeyHelp(false)).toBe("Works while any app is in front.");
  });
});

describe("history focus and names", () => {
  it("focus goes to the next entry after a delete, else the one above, else nowhere", () => {
    expect(focusAfterDelete(["a", "b", "c"], "a")).toBe("b");
    expect(focusAfterDelete(["a", "b", "c"], "b")).toBe("c");
    expect(focusAfterDelete(["a", "b", "c"], "c")).toBe("b");
    expect(focusAfterDelete(["a"], "a")).toBeUndefined();
    expect(focusAfterDelete(["a", "b"], "x")).toBeUndefined();
  });

  it("names an entry by its first words, on one line, cut at 40 characters", () => {
    expect(entryLabel("  Send   the\nreport  ")).toBe("Send the report");
    expect(entryLabel("a".repeat(40))).toBe("a".repeat(40));
    expect(entryLabel("a".repeat(41))).toBe(`${"a".repeat(39)}…`);
  });
});

describe("history side by side", () => {
  it("marks the words that changed on each side, ignoring case and punctuation", () => {
    const r = markChanges("remind the team that the release notes go out on thursday", "Remind the team that the release notes go out on Thursday, please.");
    expect(r.heard.filter((m) => m.changed).map((m) => m.text)).toEqual([]);
    expect(r.pasted.filter((m) => m.changed).map((m) => m.text)).toEqual(["please."]);
  });

  it("marks a replaced word on both sides", () => {
    const r = markChanges("thanks for the quick comma i will review", "Thanks for the quick, I will review");
    expect(r.heard.filter((m) => m.changed).map((m) => m.text)).toEqual(["comma"]);
    expect(r.pasted.filter((m) => m.changed).map((m) => m.text)).toEqual([]);
    const swapped = markChanges("send it to my email now", "send it to sam@example.com now");
    expect(swapped.heard.filter((m) => m.changed).map((m) => m.text)).toEqual(["my", "email"]);
    expect(swapped.pasted.filter((m) => m.changed).map((m) => m.text)).toEqual(["sam@example.com"]);
  });

  it("handles empty text and very long text without comparing every pair", () => {
    expect(markChanges("", "")).toEqual({ heard: [], pasted: [] });
    const long = "word ".repeat(1000);
    expect(markChanges(long, long).heard.some((m) => m.changed)).toBe(false);
  });
});

describe("history numbers and tags", () => {
  it("writes listening time in the largest sensible unit", () => {
    expect([listeningText(45_000), listeningText(38 * 60_000), listeningText(65 * 60_000), listeningText(0)]).toEqual(["45 s", "38 min", "1 h 5 min", "0 s"]);
    expect(numberText(4310)).toBe("4,310");
    expect(clockText(6400)).toBe("0:06");
    expect(clockText(125_000)).toBe("2:05");
  });

  it("names what the rewrite pass did", () => {
    expect(rewriteTag("rewritten", 4000)).toBe("Rewritten");
    expect(rewriteTag("deadline", 4000)).toBe("Pasted as said after 4 seconds");
    expect(rewriteTag("numbers-only", 4000)).toBe("Not rewritten, only numbers");
    expect(rewriteTag("failed", 4000)).toContain("could not be reached");
    expect(rewriteTag("changed-facts", 4000)).toContain("changed a number");
    expect(rewriteTag(undefined, 4000)).toBeUndefined();
  });
});

describe("expiry text", () => {
  it("rounds up to the unit the person understands", () => {
    expect(expiryText(null)).toBe("Kept for ever");
    expect(expiryText(10_000)).toBe("Removed in less than a minute");
    expect(expiryText(61_000)).toBe("Removed in 2 minutes");
    expect(expiryText(60_000)).toBe("Removed in 1 minute");
    expect(expiryText(3 * 3_600_000 - 1)).toBe("Removed in 3 hours");
    expect(expiryText(86_400_000 - 1)).toBe("Removed in 24 hours");
    expect(expiryText(86_400_000)).toBe("Removed in 1 day");
    expect(expiryText(86_400_001)).toBe("Removed in 2 days");
    expect(expiryText(3 * 3_600_000, "Audio removed")).toBe("Audio removed in 3 hours");
  });
});
