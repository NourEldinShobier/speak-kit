import { describe, expect, it } from "vite-plus/test";
import {
  appName,
  clockText,
  dayLabel,
  emptyHint,
  entriesText,
  entryLabel,
  usageHint,
  versionsCapNote,
  expiryText,
  focusAfterDelete,
  groupByDay,
  historyFooter,
  historyLead,
  hotkeyHelp,
  LANGUAGE_OPTIONS,
  languageNote,
  correctedTag,
  rewriteTag,
  rowApp,
  rowTags,
  timingTags,
  timeText,
  toggled,
} from "./model";

describe("dictation language", () => {
  it("offers to follow the keyboard language, and explains it only once chosen", () => {
    expect(LANGUAGE_OPTIONS.slice(0, 3)).toEqual([
      { value: "auto", label: "Detect automatically" },
      { value: "keyboard", label: "Follow keyboard language" },
      { value: "en", label: "English" },
    ]);
    expect(languageNote("keyboard")).toBe(
      "Uses the language of the keyboard layout in the app you dictate into. Falls back to automatic detection when the layout is unknown or the speech model cannot do it.",
    );
    expect(languageNote("de")).toBe("The language you speak.");
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

describe("usage hint", () => {
  it("says to hold the keys, speak and let go, for the hold modes", () => {
    for (const mode of ["hold", "hold-only", "tap-or-hold"]) expect(usageHint(mode, true)).toEqual({ before: "Hold", after: "in any app, speak, then let go." });
  });

  it("says to double-tap to start and press once to stop in the double-tap mode", () => {
    expect(usageHint("double-tap", true)).toEqual({ before: "Double-tap", after: "in any app to start, speak, then press it once to stop." });
  });

  it("says to press twice for the tap-to-start mode", () => {
    expect(usageHint("toggle", true)).toEqual({ before: "Press", after: "in any app to start, speak, then press it again to stop." });
  });

  it("asks to turn dictation on first while it is off", () => {
    expect(usageHint("hold", false).before).toBe("Turn dictation on, then hold");
    expect(usageHint("toggle", false).before).toBe("Turn dictation on, then press");
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

describe("history rows", () => {
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
    expect(rowTags({ kind: "restored" })).toEqual(["Recovered"]);
  });

  it("ticks and unticks entries without changing the set it was given", () => {
    const one = new Set(["a"]);
    expect([...toggled(one, "b")]).toEqual(["a", "b"]);
    expect([...toggled(one, "a")]).toEqual([]);
    expect([...one]).toEqual(["a"]);
    expect([...toggled(null, "x")]).toEqual(["x"]);
  });
});

describe("history numbers and tags", () => {
  it("writes the length of a recording as minutes and seconds", () => {
    expect(clockText(6400)).toBe("0:06");
    expect(clockText(125_000)).toBe("2:05");
  });

  it("names the stored corrections that changed an entry", () => {
    expect(correctedTag([])).toBe("");
    expect(correctedTag([{ heard: "cloud code", correct: "Claude Code" }])).toBe("Corrected cloud code → Claude Code");
    expect(
      correctedTag([
        { heard: "cloud code", correct: "Claude Code" },
        { heard: "get hub", correct: "GitHub" },
      ]),
    ).toBe("Corrected cloud code → Claude Code and 1 more");
  });

  it("names what the rewrite pass did", () => {
    expect(rewriteTag("rewritten")).toBe("Rewritten");
    expect(rewriteTag("skipped")).toBe("Pasted as said (skipped)");
    expect(rewriteTag("writer-loading")).toBe("Pasted as said (writer was loading)");
    expect(rewriteTag("numbers-only")).toBe("Not rewritten, only numbers");
    expect(rewriteTag("failed")).toContain("could not be reached");
    expect(rewriteTag("changed-facts")).toContain("changed a number");
    expect(rewriteTag("changed-style")).toContain("capital letters");
    expect(rewriteTag("changed-words")).toContain("changed words");
    expect(rewriteTag(undefined)).toBeUndefined();
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

describe("timingTags", () => {
  it("says how long the model took, in milliseconds under a second and seconds above", () => {
    expect(timingTags({ timings: { transcribeMs: 420 } })).toEqual(["Transcribed in 420 ms"]);
    expect(timingTags({ timings: { transcribeMs: 1234 } })).toEqual(["Transcribed in 1.2 s"]);
  });
  it("adds the silence that was skipped, only when some was", () => {
    expect(timingTags({ timings: { transcribeMs: 2000, pausesDroppedMs: 3400 } })).toEqual(["Transcribed in 2.0 s", "3.4 s of silence skipped"]);
    expect(timingTags({ timings: { transcribeMs: 2000, pausesDroppedMs: 0 } })).toEqual(["Transcribed in 2.0 s"]);
  });
  it("has nothing for an entry from before timings were stored", () => {
    expect(timingTags({})).toEqual([]);
    expect(timingTags({ timings: {} })).toEqual([]);
  });
});

describe("versionsCapNote", () => {
  it("is empty below five versions and warns at five", () => {
    expect(versionsCapNote(4)).toBe("");
    expect(versionsCapNote(5)).toBe("Oldest other version is replaced.");
  });
});
