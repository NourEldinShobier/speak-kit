import { describe, expect, it } from "vite-plus/test";
import type { ModelView } from "../../../shared/dictation/contract";
import {
  appName,
  dayLabel,
  downloadText,
  emptyHint,
  entriesText,
  entryLabel,
  etaText,
  focusAfterDelete,
  groupByDay,
  historyFooter,
  historyLead,
  hotkeyHelp,
  listenText,
  mb,
  modelLine,
  rowApp,
  rowTags,
  statsRows,
  timeText,
  toggled,
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
    const e = (id: string, when: number) => ({ id, at: when, text: id });
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

describe("history rows and statistics", () => {
  it("shows the file description of the program, else the executable name made readable", () => {
    expect(rowApp({ app: "notepad.exe", appName: "Notepad++" })).toBe("Notepad++");
    expect(rowApp({ app: "notepad.exe" })).toBe("Notepad");
    expect(rowApp({})).toBe("");
  });

  it("tags an entry that did not go the usual way", () => {
    expect(rowTags({})).toEqual([]);
    expect(rowTags({ outcome: "sent" })).toEqual([]);
    expect(rowTags({ kind: "interrupted", outcome: "copied" })).toEqual(["Cut short", "Copied only"]);
    expect(rowTags({ kind: "raw", outcome: "failed" })).toEqual(["Not inserted"]);
  });

  it("writes the time spoken in seconds, minutes or hours", () => {
    expect(listenText(45_000)).toBe("45 s");
    expect(listenText(12 * 60_000)).toBe("12 min");
    expect(listenText(125 * 60_000)).toBe("2 h 5 min");
    expect(listenText(120 * 60_000)).toBe("2 h");
    expect(listenText(0)).toBe("0 s");
  });

  it("lists the statistics rows with thousands separators", () => {
    expect(statsRows({ dictations: 1200, words: 34_500, listeningMs: 90_000, topApps: [], outcomes: { pasted: 1000, copied: 150, failed: 50 } })).toEqual([
      { label: "Dictations", value: "1,200" },
      { label: "Words", value: "34,500" },
      { label: "Time spoken", value: "2 min" },
      { label: "Pasted", value: "1,000" },
      { label: "Copied only", value: "150" },
      { label: "Not inserted", value: "50" },
    ]);
  });

  it("ticks and unticks entries without changing the set it was given", () => {
    const one = new Set(["a"]);
    expect([...toggled(one, "b")]).toEqual(["a", "b"]);
    expect([...toggled(one, "a")]).toEqual([]);
    expect([...one]).toEqual(["a"]);
    expect([...toggled(null, "x")]).toEqual(["x"]);
  });
});
