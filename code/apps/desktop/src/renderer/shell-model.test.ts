import { describe, expect, it } from "vite-plus/test";
import { takeDictationTab } from "./dictation-tab";
import { currentLoc, initShell, navigate, recentReadings, resolveNav, shellReducer, type ShellAction, type ShellState } from "./shell-model";

const run = (actions: ShellAction[], from: ShellState = initShell()) => actions.reduce(shellReducer, from);

describe("old and unknown places", () => {
  it("sends the old Engines page to Dictation, Models tab", () => {
    expect(resolveNav({ page: "engines" })).toEqual({ page: "dictation", tab: "models" });
    expect(resolveNav({ page: "engines", sub: "storage" })).toEqual({ page: "dictation", tab: "models" });
  });

  it("opens Dictation for a page this version does not have, and keeps a known place as it is", () => {
    expect(resolveNav({ page: "meetings" })).toEqual({ page: "dictation" });
    expect(resolveNav({ page: "settings", sub: "storage" })).toEqual({ page: "settings", sub: "storage" });
    expect(resolveNav({ page: "dictation", tab: "models" })).toEqual({ page: "dictation", tab: "models" });
  });

  it("goes to Dictation and leaves the Models tab for the page to take", () => {
    const seen: ShellAction[] = [];
    navigate((a) => seen.push(a), { page: "engines" });
    expect(seen).toEqual([{ type: "go", page: "dictation" }]);
    expect(takeDictationTab()).toBe("models");
    expect(takeDictationTab()).toBeNull();
  });
});

describe("navigation", () => {
  it("goes forward, back and forward again along the history", () => {
    let s = run([
      { type: "go", page: "voices" },
      { type: "go", page: "modes" },
    ]);
    expect(s.hist.map((l) => l.page)).toEqual(["dictation", "voices", "modes"]);
    s = run([{ type: "back" }, { type: "back" }, { type: "back" }], s);
    expect(currentLoc(s).page).toBe("dictation");
    s = run([{ type: "forward" }], s);
    expect(currentLoc(s).page).toBe("voices");
  });

  it("drops the forward entries when going somewhere new, and ignores a repeat of the current place", () => {
    let s = run([{ type: "go", page: "voices" }, { type: "go", page: "modes" }, { type: "back" }, { type: "go", page: "history" }]);
    expect(s.hist.map((l) => l.page)).toEqual(["dictation", "voices", "history"]);
    s = run([{ type: "go", page: "history" }], s);
    expect(s.hist).toHaveLength(3);
  });

  it("keeps the settings section when returning to settings without one, and resets it elsewhere", () => {
    const s = run([
      { type: "go", page: "settings", sub: "shortcuts" },
      { type: "go", page: "dictation" },
      { type: "go", page: "settings" },
    ]);
    expect(currentLoc(s)).toEqual({ page: "settings", sub: "general" });
    const t = run([
      { type: "go", page: "settings", sub: "shortcuts" },
      { type: "go", page: "settings" },
    ]);
    expect(t.hist).toHaveLength(2);
  });

  it("moving between settings sections adds no history entry; closing returns to the page before Settings", () => {
    const s = run([
      { type: "go", page: "voices" },
      { type: "go", page: "settings", sub: "storage" },
      { type: "go", page: "settings", sub: "shortcuts" },
      { type: "go", page: "settings", sub: "about" },
    ]);
    expect(s.hist.map((l) => l.page)).toEqual(["dictation", "voices", "settings"]);
    const closed = run([{ type: "close-settings" }], s);
    expect(currentLoc(closed)).toEqual({ page: "voices", sub: "general" });
    expect(closed.hist.map((l) => l.page)).toEqual(["dictation", "voices"]);
    expect(run([{ type: "close-settings" }], closed)).toBe(closed);
  });

  it("close-settings opens Dictation when Settings was the first entry and waits while a dialog is open", () => {
    const first = { ...initShell(), hist: [{ page: "settings" as const, sub: "storage" as const }] };
    expect(currentLoc(run([{ type: "close-settings" }], first)).page).toBe("dictation");
    const withDialog = run([
      { type: "go", page: "settings" },
      { type: "quit", open: true },
    ]);
    expect(run([{ type: "close-settings" }], withDialog)).toBe(withDialog);
  });

  it("closes the open reading when the page changes, keeps it on the same page", () => {
    const open = run([
      { type: "go", page: "library" },
      { type: "open-doc", doc: { id: "d1", autoplay: true } },
    ]);
    expect(run([{ type: "go", page: "library" }], open).doc).toEqual({ id: "d1", autoplay: true });
    expect(run([{ type: "go", page: "voices" }], open).doc).toBeNull();
    expect(run([{ type: "back" }], open).doc).toBeNull();
  });
});

describe("overlays", () => {
  it("toggles the sidebar and the palette", () => {
    expect(run([{ type: "toggle-side" }]).side).toBe(false);
    expect(run([{ type: "toggle-palette" }, { type: "toggle-palette" }]).palette).toBe(false);
    expect(run([{ type: "palette", open: true }]).palette).toBe(true);
  });

  it("opens the quit and export dialogs", () => {
    expect(run([{ type: "quit", open: true }]).quit).toBe(true);
    expect(run([{ type: "export", open: { text: "x", jobId: "j1" } }]).exporting).toEqual({ text: "x", jobId: "j1" });
  });
});

describe("recentReadings", () => {
  const doc = (id: string, openedAt?: number) => ({ id, title: `T${id}`, ...(openedAt === undefined ? {} : { openedAt }) });

  it("lists opened readings newest first and skips never-opened ones", () => {
    expect(recentReadings([doc("a", 1), doc("b"), doc("c", 3), doc("d", 2)])).toEqual([
      { id: "c", title: "Tc" },
      { id: "d", title: "Td" },
      { id: "a", title: "Ta" },
    ]);
  });

  it("keeps at most five and handles an empty library", () => {
    expect(recentReadings([1, 2, 3, 4, 5, 6, 7].map((n) => doc(String(n), n))).map((r) => r.id)).toEqual(["7", "6", "5", "4", "3"]);
    expect(recentReadings([])).toEqual([]);
  });
});
