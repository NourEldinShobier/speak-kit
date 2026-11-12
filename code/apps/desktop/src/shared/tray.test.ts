import { describe, expect, it } from "vite-plus/test";
import type { EngineState, Health } from "@speakkit/protocol";
import { IDLE_READER, type ReaderState } from "./reader";
import { DEFAULT_SHORTCUTS } from "./shortcuts";
import { trayIconState, trayMenuModel, trayTooltipFor, type TrayContext } from "./tray";

const health = (state: EngineState): Health => ({ app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state } });
const reader = (status: ReaderState["status"]): ReaderState => ({ ...IDLE_READER, status, title: "Chapter one", index: 2, total: 9, source: "selection" });
const ctx = (over: Partial<TrayContext> = {}): TrayContext => ({
  health: health("ready"),
  serverError: null,
  reader: IDLE_READER,
  update: { kind: "idle", checkedAtMs: null },
  exportsRunning: 0,
  doNotDisturb: false,
  shortcuts: DEFAULT_SHORTCUTS,
  ...over,
});
const labels = (c: TrayContext) => trayMenuModel(c).flatMap((i) => (i.type === "item" ? [i.label] : []));

describe("tray icon state", () => {
  it("maps engine, reading, export and update to one icon", () => {
    const cases: [Partial<TrayContext>, string][] = [
      [{}, "normal"],
      [{ health: health("unloaded") }, "asleep"],
      [{ health: health("loading") }, "working"],
      [{ health: health("error") }, "error"],
      [{ serverError: { code: "unexpected", args: { detail: "EADDRINUSE" } } }, "error"],
      [{ reader: reader("playing") }, "working"],
      [{ reader: reader("preparing") }, "working"],
      [{ reader: reader("paused") }, "paused"],
      [{ exportsRunning: 1 }, "working"],
      [{ update: { kind: "ready", version: "0.2.0", onQuit: false } }, "attention"],
      [{ update: { kind: "ready", version: "0.2.0", onQuit: false }, health: health("error") }, "error"],
      [{ update: { kind: "ready", version: "0.2.0", onQuit: false }, reader: reader("paused") }, "paused"],
    ];
    for (const [over, want] of cases) expect(trayIconState(ctx(over)), JSON.stringify(over)).toBe(want);
  });
});

describe("tray tooltip", () => {
  it("names what is happening, most specific first", () => {
    expect(trayTooltipFor(ctx({ reader: reader("playing") }))).toBe("Speak Kit - Reading 3 of 9: Chapter one");
    expect(trayTooltipFor(ctx({ reader: reader("paused") }))).toBe("Speak Kit - Paused: Chapter one");
    expect(trayTooltipFor(ctx({ exportsRunning: 2 }))).toBe("Speak Kit - Exporting 2 files");
    expect(trayTooltipFor(ctx({ update: { kind: "ready", version: "0.2.0", onQuit: false } }))).toBe("Speak Kit - Update 0.2.0 ready");
    expect(trayTooltipFor(ctx({ health: health("unloaded") }))).toBe("Speak Kit - Unloaded (wakes on play)");
  });
});

describe("tray menu, dictation", () => {
  const dictation = (enabled: boolean) => ctx({ dictation: { enabled, hotkey: "ControlLeft+AltLeft+Space" } });

  it("has no dictation rows where dictation cannot run", () => {
    expect(labels(ctx()).filter((l) => /dictat/i.test(l))).toEqual([]);
  });

  it("puts the switch, a hint with the hotkey, the history and the settings under Open Speak Kit", () => {
    expect(labels(dictation(true)).slice(0, 7)).toEqual(["Open Speak Kit", "Dictation", "Hold Ctrl Alt Space to dictate", "Paste last dictation", "Pause all shortcuts", "Dictation history", "Dictation settings"]);
  });

  it("shows Pause all shortcuts as a switch, and the paused state on the icon and in the tooltip", () => {
    const paused = { ...dictation(true), dictation: { enabled: true, hotkey: "ControlRight", paused: true } } as TrayContext;
    expect(trayMenuModel(paused).find((i) => i.type === "item" && i.action === "pause-shortcuts")).toMatchObject({ checked: true, enabled: true });
    expect(trayMenuModel(dictation(true)).find((i) => i.type === "item" && i.action === "pause-shortcuts")).toMatchObject({ checked: false });
    expect(trayIconState(paused)).toBe("paused");
    expect(trayTooltipFor(paused)).toBe("Speak Kit - Shortcuts paused");
    expect(trayTooltipFor(dictation(true))).not.toContain("paused");
  });

  it("shows the switch state, and leaves the hint out while dictation is off", () => {
    const row = (c: TrayContext) => trayMenuModel(c).find((i) => i.type === "item" && i.action === "dictation");
    expect(row(dictation(true))).toMatchObject({ checked: true, enabled: true });
    expect(row(dictation(false))).toMatchObject({ checked: false });
    expect(labels(dictation(false))).not.toContain("Hold Ctrl Alt Space to dictate");
  });

  it("the hint is not clickable", () => {
    const hint = trayMenuModel(dictation(true)).find((i) => i.type === "item" && i.label.startsWith("Hold "));
    expect(hint).toMatchObject({ enabled: false });
  });
});

describe("tray menu", () => {
  it("idle: short menu", () => {
    expect(labels(ctx())).toEqual(["Open Speak Kit", "Do not disturb", "Settings", "Check for updates", "Quit Speak Kit"]);
  });
  it("reading and paused swap in Pause or Resume and Stop", () => {
    expect(labels(ctx({ reader: reader("playing") }))).toContain("Pause");
    expect(labels(ctx({ reader: reader("paused") }))).toEqual(expect.arrayContaining(["Resume", "Stop"]));
    expect(labels(ctx({ reader: reader("paused") }))).not.toContain("Pause");
  });
  it("one row changes for asleep, engine error and update ready", () => {
    expect(labels(ctx({ health: health("unloaded") }))).toContain("Load the voice engine now");
    expect(labels(ctx({ health: health("error") }))).toContain("Restart the voice engine");
    const ready = labels(ctx({ update: { kind: "ready", version: "0.2.0", onQuit: false } }));
    expect(ready).toContain("Restart to update to 0.2.0");
    expect(ready).not.toContain("Check for updates");
  });
  it("Do not disturb shows its state; update check is disabled while checking or unsupported", () => {
    expect(trayMenuModel(ctx({ doNotDisturb: true })).find((i) => i.type === "item" && i.action === "dnd")).toMatchObject({ checked: true });
    const check = (u: TrayContext["update"]) => trayMenuModel(ctx({ update: u })).find((i) => i.type === "item" && i.action === "check-updates");
    expect(check({ kind: "checking" })).toMatchObject({ enabled: false, label: "Checking for updates..." });
    expect(check({ kind: "unsupported" })).toMatchObject({ enabled: false });
  });
});
